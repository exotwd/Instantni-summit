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

func (s *AmendmentService) DebateState(ctx context.Context) (domain.DebateState, error) {
	repo := repository.NewAmendmentRepository(s.db)
	session, err := repo.CurrentDebate(ctx)
	if err != nil {
		return domain.DebateState{}, err
	}
	if session == nil {
		return domain.DebateState{}, nil
	}
	state := domain.DebateState{Session: session}
	if session.AmendmentID != nil {
		state.Amendment, _ = repo.Get(ctx, *session.AmendmentID)
	}
	delegations := repository.NewDelegationRepository(s.db)
	state.Submitter = publicDelegationPtr(ctx, delegations, session.SubmitterDelegationID)
	state.Supporter = publicDelegationPtr(ctx, delegations, session.SupporterDelegationID)
	state.Opponent = publicDelegationPtr(ctx, delegations, session.OpponentDelegationID)
	return state, nil
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

func (s *AmendmentService) Accept(ctx context.Context, id int64) error {
	return s.setStatus(ctx, id, domain.AmendmentAccepted)
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
		if amendment.Status != domain.AmendmentIntroduced {
			return NewUserError("amendment_not_introduced", "PN musí být nejdřív zapracovaný a představený.")
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

func (s *AmendmentService) SelectDebateDelegation(ctx context.Context, delegationID int64) error {
	return s.updateDebate(ctx, func(session *domain.DebateSession) error {
		switch session.Phase {
		case domain.DebateSelectSupporter:
			session.SupporterDelegationID = &delegationID
			session.Phase = domain.DebateSelectOpponent
		case domain.DebateSelectOpponent:
			if session.SupporterDelegationID != nil && *session.SupporterDelegationID == delegationID {
				return NewUserError("same_delegation", "Podporovatel a odpůrce nesmí být stejná delegace.")
			}
			session.OpponentDelegationID = &delegationID
			// Selection only stores the opponent. The chair must click once more to start the next speech.
			session.Phase = domain.DebateSelectOpponent
		default:
			return NewUserError("debate_not_selecting", "Teď se nevybírá delegace do jednání.")
		}
		return nil
	})
}

func (s *AmendmentService) AdvanceDebate(ctx context.Context) error {
	return s.updateDebate(ctx, func(session *domain.DebateSession) error {
		switch session.Phase {
		case domain.DebateSubmitterReading:
			// First click after the submitter ends the speech and opens the supporter/opponent selection.
			session.Phase = domain.DebateSelectSupporter
		case domain.DebateSelectSupporter:
			if session.SupporterDelegationID == nil {
				return NewUserError("missing_supporter", "Nejdřív vyber podporovatele návrhu.")
			}
			session.Phase = domain.DebateSelectOpponent
		case domain.DebateSelectOpponent:
			if session.OpponentDelegationID == nil {
				return NewUserError("missing_opponent", "Nejdřív vyber odpůrce návrhu.")
			}
			if session.SupporterDelegationID != nil {
				// Second click after the selection starts the supporter speech.
				session.Phase = domain.DebateSupporterSpeaking
			} else {
				session.Phase = domain.DebateOpponentSpeaking
			}
		case domain.DebateSupporterSpeaking:
			// First click after the supporter ends the speech. Opponent speech starts only after another click.
			session.Phase = domain.DebateSelectOpponent
		case domain.DebateOpponentSpeaking:
			// First click after the opponent ends the speech and makes the PN ready for voting.
			session.Phase = domain.DebateReadyToVote
		case domain.DebateReadyToVote:
			return nil
		default:
			session.Phase = domain.DebateSubmitterReading
		}
		return nil
	})
}

func (s *AmendmentService) CancelDebate(ctx context.Context) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewAmendmentRepository(tx).ClearDebate(ctx); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "debate")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventDebateUpdated, "admin", "", map[string]string{"status": "cancelled"})
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventDebateUpdated, Revision: revision, Payload: map[string]string{"status": "cancelled"}})
	}
	return err
}

func (s *AmendmentService) updateDebate(ctx context.Context, mutate func(*domain.DebateSession) error) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		repo := repository.NewAmendmentRepository(tx)
		session, err := repo.CurrentDebate(ctx)
		if err != nil {
			return err
		}
		if session == nil {
			return NewUserError("not_found", "Právě neběží žádné jednání o PN.")
		}
		if err := mutate(session); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "debate")
		if err != nil {
			return err
		}
		if err := repo.UpdateDebate(ctx, *session, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventDebateUpdated, "admin", "", map[string]any{"sessionId": session.ID, "phase": session.Phase})
	})
	if err == nil {
		state, _ := s.DebateState(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventDebateUpdated, Revision: revision, Payload: state})
	}
	return err
}

func publicDelegationPtr(ctx context.Context, repo *repository.DelegationRepository, id *int64) *domain.PublicDelegation {
	if id == nil {
		return nil
	}
	delegation, err := repo.Get(ctx, *id, false)
	if err != nil || delegation == nil {
		return nil
	}
	public := delegation.Public()
	return &public
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
