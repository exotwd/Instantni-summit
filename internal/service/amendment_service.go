package service

import (
	"context"
	"database/sql"
	"strings"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type AmendmentService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewAmendmentService(db *sql.DB, hub *realtime.Hub) *AmendmentService {
	return &AmendmentService{db: db, hub: hub}
}

func (s *AmendmentService) List(ctx context.Context) ([]domain.Amendment, error) {
	return repository.NewAmendmentRepository(s.db).List(ctx)
}

func (s *AmendmentService) Create(ctx context.Context, amendment domain.Amendment) (*domain.Amendment, error) {
	return s.create(ctx, amendment, "admin")
}

func (s *AmendmentService) SubmitFromDelegate(ctx context.Context, delegationID int64, amendment domain.Amendment) (*domain.Amendment, error) {
	amendment.SubmitterDelegationID = &delegationID
	amendment.Status = domain.AmendmentSubmitted
	return s.create(ctx, amendment, "delegate")
}

func (s *AmendmentService) create(ctx context.Context, amendment domain.Amendment, actor string) (*domain.Amendment, error) {
	if amendment.Status == "" {
		amendment.Status = domain.AmendmentSubmitted
	}
	if err := s.validate(ctx, amendment); err != nil {
		return nil, err
	}
	var id, revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		var err error
		id, err = repository.NewAmendmentRepository(tx).Create(ctx, amendment)
		if err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "resolution")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventResolutionUpdated, actor, "", amendment)
	})
	if err != nil {
		return nil, err
	}
	created, err := repository.NewAmendmentRepository(s.db).Get(ctx, id)
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventResolutionUpdated, Revision: revision, Payload: created})
	}
	return created, err
}

func (s *AmendmentService) Update(ctx context.Context, amendment domain.Amendment) error {
	if err := s.validate(ctx, amendment); err != nil {
		return err
	}
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewAmendmentRepository(tx).Update(ctx, amendment); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "resolution")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventResolutionUpdated, "admin", "", amendment)
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventResolutionUpdated, Revision: revision, Payload: amendment})
	}
	return err
}

func (s *AmendmentService) Introduce(ctx context.Context, id int64) error {
	return s.setStatus(ctx, id, domain.AmendmentIntroduced)
}

func (s *AmendmentService) Reject(ctx context.Context, id int64) error {
	return s.setStatus(ctx, id, domain.AmendmentRejected)
}

func (s *AmendmentService) setStatus(ctx context.Context, id int64, status string) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewAmendmentRepository(tx).SetStatus(ctx, id, status); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "resolution")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventResolutionUpdated, "admin", "", map[string]any{"id": id, "status": status})
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventResolutionUpdated, Revision: revision, Payload: map[string]any{"id": id, "status": status}})
	}
	return err
}

func (s *AmendmentService) StartDebate(ctx context.Context, id int64) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		repo := repository.NewAmendmentRepository(tx)
		amendment, err := repo.Get(ctx, id)
		if err != nil {
			return err
		}
		if amendment == nil {
			return NewUserError("not_found", "Pozměňovací návrh nebyl nalezen.")
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "debate")
		if err != nil {
			return err
		}
		if _, err := repo.StartDebate(ctx, *amendment, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventDebateUpdated, "admin", "", amendment)
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventDebateUpdated, Revision: revision, Payload: map[string]any{"amendmentId": id}})
	}
	return err
}

func (s *AmendmentService) validate(ctx context.Context, amendment domain.Amendment) error {
	amendment.Type = strings.TrimSpace(amendment.Type)
	if amendment.Type != domain.AmendmentAdd && amendment.Type != domain.AmendmentUpdate && amendment.Type != domain.AmendmentRemove {
		return NewUserError("invalid_amendment_type", "Neplatný typ pozměňovacího návrhu.")
	}
	if amendment.Type != domain.AmendmentRemove && strings.TrimSpace(amendment.Text) == "" {
		return NewUserError("missing_text", "Text pozměňovacího návrhu je povinný.")
	}
	if amendment.Type == domain.AmendmentUpdate || amendment.Type == domain.AmendmentRemove {
		if amendment.TargetPointID == nil {
			return NewUserError("missing_target", "Vyberte cílový bod rezoluce.")
		}
		point, err := repository.NewResolutionRepository(s.db).Get(ctx, *amendment.TargetPointID)
		if err != nil {
			return err
		}
		if point == nil || point.Status != domain.ResolutionActive {
			return NewUserError("invalid_target", "Cílový bod neexistuje nebo není aktivní.")
		}
	}
	return nil
}
