package service

import (
	"context"
	"database/sql"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"mun-app/internal/config"
	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type SettingsService struct {
	db  *sql.DB
	hub *realtime.Hub
	cfg config.Config
}

func NewSettingsService(db *sql.DB, hub *realtime.Hub, cfg config.Config) *SettingsService {
	return &SettingsService{db: db, hub: hub, cfg: cfg}
}

func (s *SettingsService) GetSettings(ctx context.Context) (domain.SettingsSnapshot, error) {
	settings, err := repository.NewSettingsRepository(s.db).GetAll(ctx)
	if err != nil {
		return domain.SettingsSnapshot{}, err
	}
	safe := map[string]string{}
	for key, value := range settings {
		if strings.Contains(key, "_hash") {
			continue
		}
		safe[key] = value
	}
	revision, err := repository.NewEventRepository(s.db).Revision(ctx, "settings")
	if err != nil {
		return domain.SettingsSnapshot{}, err
	}
	return domain.SettingsSnapshot{
		Revision: revision,
		Values: safe,
		DefaultsWarning: settings["admin_pin_is_default"] == "true" || settings["screen_pin_is_default"] == "true",
	}, nil
}

func (s *SettingsService) UpdateSettings(ctx context.Context, values map[string]string) (int64, error) {
	for key, value := range values {
		if strings.HasSuffix(key, "_time_sec") {
			if n, err := strconv.Atoi(value); err != nil || n <= 0 {
				return 0, NewUserError("invalid_time_limit", "Časové limity musí být kladná čísla.")
			}
		}
	}
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		settings := repository.NewSettingsRepository(tx)
		if err := settings.SetMany(ctx, values); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "settings")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventSettingsUpdated, "admin", "", sanitizeSettings(values))
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventSettingsUpdated, Revision: revision, Payload: sanitizeSettings(values)})
	}
	return revision, err
}

func (s *SettingsService) GetVotingTimeLimit(ctx context.Context) (int, error) {
	value, ok, err := repository.NewSettingsRepository(s.db).Get(ctx, "default_voting_time_sec")
	if err != nil {
		return 0, err
	}
	if !ok {
		return 60, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return 60, nil
	}
	return n, nil
}

func (s *SettingsService) ChangeAdminPIN(ctx context.Context, pin string) error {
	return s.changePIN(ctx, "admin", pin)
}

func (s *SettingsService) ChangeScreenPIN(ctx context.Context, pin string) error {
	return s.changePIN(ctx, "screen", pin)
}

func (s *SettingsService) changePIN(ctx context.Context, role, pin string) error {
	if len(pin) < 4 {
		return NewUserError("invalid_pin", "PIN musí mít alespoň 4 znaky.")
	}
	hash, err := HashPIN(pin)
	if err != nil {
		return err
	}
	values := map[string]string{role + "_pin_hash": hash, role + "_pin_is_default": "false"}
	_, err = s.UpdateSettings(ctx, values)
	return err
}

func (s *SettingsService) ResetLiveData(ctx context.Context) (int64, error) {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewSettingsRepository(tx).ResetLive(ctx); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		for _, key := range []string{"voting", "speaker", "break", "debate"} {
			var err error
			revision, err = events.BumpRevision(ctx, key)
			if err != nil {
				return err
			}
		}
		return events.Log(ctx, realtime.EventResetPerformed, "admin", "", map[string]string{"scope": "live"})
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventResetPerformed, Revision: revision, Payload: map[string]string{"scope": "live"}})
	}
	return revision, err
}

func (s *SettingsService) ResetAllData(ctx context.Context) (int64, error) {
	if err := s.createBackup(); err != nil {
		return 0, err
	}
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		settings := repository.NewSettingsRepository(tx)
		if err := settings.ResetAll(ctx); err != nil {
			return err
		}
		delegations := repository.NewDelegationRepository(tx)
		if err := delegations.SeedDefaultEU(ctx); err != nil {
			return err
		}
		if err := delegations.EnsureSpeakerState(ctx); err != nil {
			return err
		}
		_, err := repository.NewResolutionRepository(tx).AddPoint(ctx, "Členské státy potvrzují závazek ke koordinovanému a věcnému jednání.", nil)
		if err != nil {
			return err
		}
		_, err = repository.NewResolutionRepository(tx).AddPoint(ctx, "Výsledná doporučení budou formulována s ohledem na proveditelnost a transparentnost.", nil)
		if err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "settings")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventResetPerformed, "admin", "", map[string]string{"scope": "all"})
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventResetPerformed, Revision: revision, Payload: map[string]string{"scope": "all"}})
	}
	return revision, err
}

func (s *SettingsService) createBackup() error {
	if s.cfg.DBPath == ":memory:" {
		return nil
	}
	if err := os.MkdirAll(s.cfg.BackupDir, 0o750); err != nil {
		return err
	}
	src, err := os.Open(s.cfg.DBPath)
	if err != nil {
		return err
	}
	defer src.Close()
	name := "mun-" + time.Now().Format("20060102-150405") + ".db"
	backupPath := filepath.Join(s.cfg.BackupDir, name)
	if _, err := s.db.Exec(`vacuum main into '` + strings.ReplaceAll(backupPath, `'`, `''`) + `'`); err == nil {
		return nil
	}
	dst, err := os.Create(backupPath)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}

func sanitizeSettings(values map[string]string) map[string]string {
	safe := map[string]string{}
	for key, value := range values {
		if strings.Contains(key, "_hash") {
			continue
		}
		safe[key] = value
	}
	return safe
}
