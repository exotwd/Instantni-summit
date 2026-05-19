package service

import (
	"context"
	"database/sql"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type BreakService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewBreakService(db *sql.DB, hub *realtime.Hub) *BreakService {
	return &BreakService{db: db, hub: hub}
}

func (s *BreakService) StartBreak(ctx context.Context, typ, title string, durationMinutes int) (*domain.Break, error) {
	if typ != domain.BreakCaucus && typ != domain.BreakCoffee && typ != domain.BreakCustom {
		return nil, NewUserError("invalid_break_type", "Neplatný typ přestávky.")
	}
	if title == "" {
		title = "Přestávka"
	}
	if durationMinutes <= 0 {
		return nil, NewUserError("invalid_break_duration", "Délka přestávky musí být kladná.")
	}
	endsAt := time.Now().UTC().Add(time.Duration(durationMinutes) * time.Minute)
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "break")
		if err != nil {
			return err
		}
		if _, err := repository.NewBreakRepository(tx).Start(ctx, typ, title, endsAt, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventBreakStarted, "admin", "", map[string]any{"type": typ, "title": title})
	})
	active, activeErr := s.GetActiveBreak(ctx)
	if err == nil && activeErr == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventBreakStarted, Revision: revision, Payload: active})
	}
	return active, firstErr(err, activeErr)
}

func (s *BreakService) EndBreak(ctx context.Context) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "break")
		if err != nil {
			return err
		}
		if err := repository.NewBreakRepository(tx).EndActive(ctx, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventBreakEnded, "admin", "", nil)
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventBreakEnded, Revision: revision, Payload: nil})
	}
	return err
}

func (s *BreakService) GetActiveBreak(ctx context.Context) (*domain.Break, error) {
	return repository.NewBreakRepository(s.db).Active(ctx)
}

func firstErr(a, b error) error {
	if a != nil {
		return a
	}
	return b
}
