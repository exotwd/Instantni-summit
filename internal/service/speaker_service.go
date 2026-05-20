package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type SpeakerService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewSpeakerService(db *sql.DB, hub *realtime.Hub) *SpeakerService {
	return &SpeakerService{db: db, hub: hub}
}

func (s *SpeakerService) Snapshot(ctx context.Context) (domain.SpeakerSnapshot, error) {
	repo := repository.NewSpeakerRepository(s.db)
	state, err := repo.State(ctx)
	if err != nil {
		return domain.SpeakerSnapshot{}, err
	}
	queue, err := repo.Queue(ctx)
	if err != nil {
		return domain.SpeakerSnapshot{}, err
	}
	reactions, err := repo.Reactions(ctx)
	if err != nil {
		return domain.SpeakerSnapshot{}, err
	}
	delegations := repository.NewDelegationRepository(s.db)
	var current, active *domain.Delegation
	if state.CurrentDelegationID != nil {
		current, _ = delegations.Get(ctx, *state.CurrentDelegationID, false)
	}
	if state.ActiveReactionDelegationID != nil {
		active, _ = delegations.Get(ctx, *state.ActiveReactionDelegationID, false)
	}
	return domain.SpeakerSnapshot{Revision: state.Revision, State: state, CurrentSpeaker: current, ActiveReaction: active, Queue: queue, Reactions: reactions}, nil
}

func (s *SpeakerService) AddSpeaker(ctx context.Context, delegationID int64) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		err := repository.NewSpeakerRepository(tx).AddQueue(ctx, delegationID)
		if err != nil && strings.Contains(err.Error(), "constraint") {
			return NewUserError("speaker_duplicate", "Delegace už je v pořadníku.")
		}
		return err
	})
}

func (s *SpeakerService) AddReaction(ctx context.Context, delegationID int64) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		repo := repository.NewSpeakerRepository(tx)
		state, err := repo.State(ctx)
		if err != nil {
			return err
		}
		if state.CurrentDelegationID == nil {
			return NewUserError("no_current_speaker", "Není spuštěn projev.")
		}
		if state.ActiveReactionDelegationID != nil {
			return NewUserError("reaction_started", "Po spuštění reakce už nelze přidat další reakce.")
		}
		if *state.CurrentDelegationID == delegationID {
			return NewUserError("reaction_to_self", "Delegace nemůže reagovat na vlastní projev.")
		}
		reactions, err := repo.Reactions(ctx)
		if err != nil {
			return err
		}
		if len(reactions) >= 2 {
			return NewUserError("too_many_reactions", "Na jeden projev jsou povolené nejvýše dvě reakce.")
		}
		err = repo.AddReaction(ctx, delegationID)
		if err != nil && strings.Contains(err.Error(), "constraint") {
			return NewUserError("reaction_duplicate", "Delegace už má reakci.")
		}
		return err
	})
}

func (s *SpeakerService) NextSpeaker(ctx context.Context) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		repo := repository.NewSpeakerRepository(tx)
		state, err := repo.State(ctx)
		if err != nil {
			return err
		}
		if state.ActiveReactionDelegationID != nil {
			if err := repo.FinishActiveReaction(ctx); err != nil {
				return err
			}
			reactions, err := repo.Reactions(ctx)
			if err != nil {
				return err
			}
			if next := firstWaitingReaction(reactions); next != nil {
				activeID, err := repo.StartReaction(ctx, next.ID)
				if err != nil {
					return err
				}
				return repo.SetActiveReaction(ctx, activeID)
			}
			if countFinishedReactions(reactions) >= 2 {
				return advanceMainSpeaker(ctx, repo)
			}
			if state.CurrentDelegationID != nil {
				startedAt := time.Now().UTC().Add(-time.Duration(state.CurrentPausedMS) * time.Millisecond)
				return repo.ResumeCurrent(ctx, startedAt)
			}
			return repo.SetActiveReaction(ctx, nil)
		}
		reactions, err := repo.Reactions(ctx)
		if err != nil {
			return err
		}
		if state.CurrentDelegationID != nil {
			if next := firstWaitingReaction(reactions); next != nil {
				if err := repo.PauseCurrent(ctx, currentElapsedMS(state)); err != nil {
					return err
				}
				activeID, err := repo.StartReaction(ctx, next.ID)
				if err != nil {
					return err
				}
				return repo.SetActiveReaction(ctx, activeID)
			}
		}
		return advanceMainSpeaker(ctx, repo)
	})
}

func advanceMainSpeaker(ctx context.Context, repo *repository.SpeakerRepository) error {
	next, err := repo.FirstQueue(ctx)
	if err != nil {
		return err
	}
	if err := repo.ClearReactions(ctx); err != nil {
		return err
	}
	if next == nil {
		return repo.SetCurrent(ctx, nil)
	}
	if err := repo.RemoveQueue(ctx, next.ID); err != nil {
		return err
	}
	return repo.SetCurrent(ctx, &next.DelegationID)
}

func firstWaitingReaction(reactions []domain.SpeakerReaction) *domain.SpeakerReaction {
	for i := range reactions {
		if reactions[i].Status == domain.ReactionWaiting {
			return &reactions[i]
		}
	}
	return nil
}

func countFinishedReactions(reactions []domain.SpeakerReaction) int {
	var count int
	for _, reaction := range reactions {
		if reaction.Status == domain.ReactionFinished {
			count++
		}
	}
	return count
}

func currentElapsedMS(state domain.SpeakerState) int64 {
	if state.CurrentPausedMS > 0 {
		return state.CurrentPausedMS
	}
	if state.CurrentStartedAt == nil {
		return 0
	}
	elapsed := time.Since(state.CurrentStartedAt.UTC()).Milliseconds()
	if elapsed < 0 {
		return 0
	}
	return elapsed
}

func (s *SpeakerService) RemoveSpeaker(ctx context.Context, queueItemID int64) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		return repository.NewSpeakerRepository(tx).RemoveQueue(ctx, queueItemID)
	})
}

func (s *SpeakerService) RemoveReaction(ctx context.Context, reactionID int64) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		return repository.NewSpeakerRepository(tx).RemoveReaction(ctx, reactionID)
	})
}

func (s *SpeakerService) Clear(ctx context.Context) error {
	return s.mutate(ctx, realtime.EventSpeakerUpdated, func(tx *sql.Tx, revision int64) error {
		return repository.NewSpeakerRepository(tx).Clear(ctx)
	})
}

func (s *SpeakerService) mutate(ctx context.Context, eventType string, fn func(*sql.Tx, int64) error) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "speaker")
		if err != nil {
			return err
		}
		if err := fn(tx, revision); err != nil {
			return err
		}
		if err := repository.NewSpeakerRepository(tx).BumpRevisionOnly(ctx, revision); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		return events.Log(ctx, eventType, "admin", "", nil)
	})
	if err == nil {
		state, _ := s.Snapshot(ctx)
		s.hub.Publish(realtime.Event{Type: eventType, Revision: revision, Payload: state})
	}
	return err
}
