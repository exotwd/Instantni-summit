package service

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type AgendaService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewAgendaService(db *sql.DB, hub *realtime.Hub) *AgendaService {
	return &AgendaService{db: db, hub: hub}
}

func (s *AgendaService) ListAgenda(ctx context.Context) ([]domain.AgendaItem, error) {
	return repository.NewAgendaRepository(s.db).List(ctx)
}

func (s *AgendaService) CreateAgendaItem(ctx context.Context, item domain.AgendaItem) (*domain.AgendaItem, error) {
	item = normalizeAgendaItem(item)
	if err := validateAgenda(item); err != nil {
		return nil, err
	}
	var id, revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		var err error
		id, err = repository.NewAgendaRepository(tx).Create(ctx, item)
		if err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "agenda")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAgendaUpdated, "admin", "", item)
	})
	if err != nil {
		return nil, err
	}
	created, err := repository.NewAgendaRepository(s.db).Get(ctx, id)
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventAgendaUpdated, Revision: revision, Payload: created})
	}
	return created, err
}

func (s *AgendaService) UpdateAgendaItem(ctx context.Context, item domain.AgendaItem) error {
	item = normalizeAgendaItem(item)
	if err := validateAgenda(item); err != nil {
		return err
	}
	return s.mutate(ctx, func(tx *sql.Tx) error {
		return repository.NewAgendaRepository(tx).Update(ctx, item)
	})
}

func (s *AgendaService) DeleteAgendaItem(ctx context.Context, id int64) error {
	return s.mutate(ctx, func(tx *sql.Tx) error {
		return repository.NewAgendaRepository(tx).Delete(ctx, id)
	})
}

func (s *AgendaService) ReorderAgendaItems(ctx context.Context, ids []int64) error {
	return s.mutate(ctx, func(tx *sql.Tx) error {
		return repository.NewAgendaRepository(tx).Reorder(ctx, ids)
	})
}

func (s *AgendaService) mutate(ctx context.Context, fn func(*sql.Tx) error) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := fn(tx); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "agenda")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAgendaUpdated, "admin", "", nil)
	})
	if err == nil {
		items, _ := s.ListAgenda(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventAgendaUpdated, Revision: revision, Payload: items})
	}
	return err
}

func validateAgenda(item domain.AgendaItem) error {
	if strings.TrimSpace(item.Title) == "" {
		return NewUserError("missing_title", "Název bodu programu je povinný.")
	}
	if item.DurationMinutes != nil && *item.DurationMinutes <= 0 {
		return NewUserError("invalid_duration", "DĂ©lka bodu programu musĂ­ bĂ˝t kladnĂˇ.")
	}
	if item.StartsAt != nil && item.EndsAt != nil && !item.EndsAt.After(*item.StartsAt) {
		return NewUserError("invalid_agenda_time", "Konec bodu programu musĂ­ bĂ˝t po zaÄŤĂˇtku.")
	}
	switch item.Type {
	case domain.AgendaSession, domain.AgendaBreak, domain.AgendaCaucus, domain.AgendaVoting, domain.AgendaOrganizational, domain.AgendaOther:
		return nil
	default:
		return NewUserError("invalid_agenda_type", "Neplatný typ bodu programu.")
	}
}

func normalizeAgendaItem(item domain.AgendaItem) domain.AgendaItem {
	item.Title = strings.TrimSpace(item.Title)
	item.Type = strings.TrimSpace(item.Type)
	item.Note = strings.TrimSpace(item.Note)
	if item.DurationMinutes != nil && *item.DurationMinutes <= 0 {
		item.DurationMinutes = nil
	}
	if item.StartsAt != nil && item.EndsAt == nil && item.DurationMinutes != nil {
		endsAt := item.StartsAt.Add(time.Duration(*item.DurationMinutes) * time.Minute)
		item.EndsAt = &endsAt
	}
	if item.StartsAt != nil && item.EndsAt != nil && item.DurationMinutes == nil {
		minutes := int(item.EndsAt.Sub(*item.StartsAt).Minutes())
		if minutes > 0 {
			item.DurationMinutes = &minutes
		}
	}
	return item
}
