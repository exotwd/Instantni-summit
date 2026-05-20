package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"fmt"
	"regexp"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type AttendanceService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewAttendanceService(db *sql.DB, hub *realtime.Hub) *AttendanceService {
	return &AttendanceService{db: db, hub: hub}
}

func (s *AttendanceService) List(ctx context.Context) (domain.AttendanceSnapshot, error) {
	delegations, err := repository.NewDelegationRepository(s.db).List(ctx, true)
	if err != nil {
		return domain.AttendanceSnapshot{}, err
	}
	revision, err := repository.NewEventRepository(s.db).Revision(ctx, "attendance")
	if err != nil {
		return domain.AttendanceSnapshot{}, err
	}
	return domain.AttendanceSnapshot{Revision: revision, Delegations: delegations}, nil
}

func (s *AttendanceService) CheckIn(ctx context.Context, delegationID int64, participant domain.Participant, note string) (string, error) {
	var revision int64
	err = database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewDelegationRepository(tx).SetPresence(ctx, delegationID, true); err != nil {
			return err
		}
		if err := repository.NewAttendanceRepository(tx).InsertRecord(ctx, domain.AttendanceRecord{
			DelegationID: delegationID, Present: true, CheckedBy: "admin", Note: note,
		}); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", map[string]any{"delegationId": delegationID})
	})
	if err == nil {
		state, _ := s.List(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return "", err
}

func (s *AttendanceService) CheckOut(ctx context.Context, delegationID int64) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewDelegationRepository(tx).SetPresence(ctx, delegationID, false); err != nil {
			return err
		}
		if err := repository.NewAttendanceRepository(tx).InsertRecord(ctx, domain.AttendanceRecord{
			DelegationID: delegationID, Present: false, CheckedBy: "admin",
		}); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", map[string]any{"delegationId": delegationID})
	})
	if err == nil {
		state, _ := s.List(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return err
}

func (s *AttendanceService) GenerateAccessCode(ctx context.Context, delegationID int64) (string, error) {
	code, err := s.newUniqueCode(ctx)
	if err != nil {
		return "", err
	}
	var revision int64
	err = database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewDelegationRepository(tx).SetAccessCode(ctx, delegationID, code); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", map[string]any{"delegationId": delegationID})
	})
	if err == nil {
		state, _ := s.List(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return code, err
}

func (s *AttendanceService) GenerateVoteLinks(ctx context.Context) (domain.AttendanceSnapshot, error) {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		repo := repository.NewDelegationRepository(tx)
		delegations, err := repo.List(ctx, false)
		if err != nil {
			return err
		}
		for _, delegation := range delegations {
			token, err := s.newUniqueVoteLinkToken(ctx, repo)
			if err != nil {
				return err
			}
			if err := repo.SetVoteLinkToken(ctx, delegation.ID, token); err != nil {
				return err
			}
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", map[string]string{"voteLinks": "generated"})
	})
	if err != nil {
		return domain.AttendanceSnapshot{}, err
	}
	state, err := s.List(ctx)
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return state, err
}

func (s *AttendanceService) UpdateParticipant(ctx context.Context, participant domain.Participant) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if _, err := repository.NewParticipantRepository(tx).UpsertForDelegation(ctx, participant); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", participant)
	})
	if err == nil {
		state, _ := s.List(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return err
}

func (s *AttendanceService) SetAccessCodeEnabled(ctx context.Context, delegationID int64, enabled bool) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewDelegationRepository(tx).SetAccessCodeEnabled(ctx, delegationID, enabled); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", map[string]any{"delegationId": delegationID, "accessCodeEnabled": enabled})
	})
	if err == nil {
		state, _ := s.List(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: state})
	}
	return err
}

func (s *AttendanceService) LoginByCode(ctx context.Context, code string) (*domain.Delegation, error) {
	if !regexp.MustCompile(`^\d{4}$`).MatchString(code) {
		return nil, NewUserError("invalid_code", "Zadejte čtyřmístný kód.")
	}
	delegation, err := repository.NewDelegationRepository(s.db).FindByAccessCode(ctx, code)
	if err != nil {
		return nil, err
	}
	if delegation == nil {
		return nil, NewUserError("bad_code", "Kód není platný nebo není pro tuto delegaci povolený.")
	}
	return delegation, nil
}

func (s *AttendanceService) LoginByVoteLink(ctx context.Context, token string) (*domain.Delegation, error) {
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{12,32}$`).MatchString(token) {
		return nil, NewUserError("invalid_link", "Odkaz není platný.")
	}
	delegation, err := repository.NewDelegationRepository(s.db).FindByVoteLinkToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if delegation == nil {
		return nil, NewUserError("bad_link", "Odkaz není platný.")
	}
	return delegation, nil
}

func (s *AttendanceService) newUniqueCode(ctx context.Context) (string, error) {
	repo := repository.NewDelegationRepository(s.db)
	for i := 0; i < 100; i++ {
		code, err := randomFourDigits()
		if err != nil {
			return "", err
		}
		exists, err := repo.AccessCodeExists(ctx, code)
		if err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", NewUserError("code_generation_failed", "Nepodařilo se vygenerovat unikátní kód.")
}

func (s *AttendanceService) newUniqueVoteLinkToken(ctx context.Context, repo *repository.DelegationRepository) (string, error) {
	for i := 0; i < 100; i++ {
		token, err := randomURLToken()
		if err != nil {
			return "", err
		}
		exists, err := repo.VoteLinkTokenExists(ctx, token)
		if err != nil {
			return "", err
		}
		if !exists {
			return token, nil
		}
	}
	return "", NewUserError("link_generation_failed", "Nepodařilo se vygenerovat unikátní hlasovací odkaz.")
}

func randomURLToken() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func randomFourDigits() (string, error) {
	buf := []byte{0, 0}
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	n := (int(buf[0])<<8 + int(buf[1])) % 10000
	return fmt.Sprintf("%04d", n), nil
}
