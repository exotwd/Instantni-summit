package service

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type VotingService struct {
	db         *sql.DB
	hub        *realtime.Hub
	settings   *SettingsService
	resolution *ResolutionService
}

func NewVotingService(db *sql.DB, hub *realtime.Hub, settings *SettingsService, resolution *ResolutionService) *VotingService {
	return &VotingService{db: db, hub: hub, settings: settings, resolution: resolution}
}

func (s *VotingService) StartVoting(ctx context.Context, amendmentID *int64) (*domain.VotingState, error) {
	if amendmentID != nil {
		amendment, err := repository.NewAmendmentRepository(s.db).Get(ctx, *amendmentID)
		if err != nil {
			return nil, err
		}
		if amendment == nil {
			return nil, NewUserError("not_found", "Pozměňovací návrh nebyl nalezen.")
		}
	}
	limit, err := s.settings.GetVotingTimeLimit(ctx)
	if err != nil {
		return nil, err
	}
	var revision int64
	err = database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "voting")
		if err != nil {
			return err
		}
		if _, err := repository.NewVotingRepository(tx).Start(ctx, amendmentID, limit, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventVotingUpdated, "admin", "", map[string]any{"amendmentId": amendmentID})
	})
	state, stateErr := s.GetCurrentVotingState(ctx, nil, true)
	if err == nil && stateErr == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventVotingUpdated, Revision: revision, Payload: state})
	}
	if err != nil {
		return nil, err
	}
	return &state, stateErr
}

func (s *VotingService) CastVote(ctx context.Context, delegationID int64, choice, source string) (*domain.VotingState, error) {
	if choice != domain.VoteFor && choice != domain.VoteAgainst && choice != domain.VoteAbstain {
		return nil, NewUserError("invalid_vote", "Neplatná volba hlasování.")
	}
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		votes := repository.NewVotingRepository(tx)
		session, err := votes.Current(ctx)
		if err != nil {
			return err
		}
		if session == nil || session.Status != domain.VotingOpen {
			return NewUserError("voting_closed", "Hlasování není otevřené.")
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "voting")
		if err != nil {
			return err
		}
		if err := votes.Cast(ctx, session.ID, delegationID, choice, source, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventVotingUpdated, source, strconvFormatInt(delegationID), map[string]any{"choice": choice, "sessionId": session.ID})
	})
	state, stateErr := s.GetCurrentVotingState(ctx, &delegationID, false)
	if err == nil && stateErr == nil {
		adminState, _ := s.GetCurrentVotingState(ctx, nil, true)
		s.hub.Publish(realtime.Event{Type: realtime.EventVotingUpdated, Revision: revision, Payload: adminState})
	}
	if err != nil {
		return nil, err
	}
	return &state, stateErr
}

func (s *VotingService) CloseVoting(ctx context.Context, sessionID int64) error {
	return s.setStatus(ctx, sessionID, domain.VotingClosed, realtime.EventVotingClosed)
}

func (s *VotingService) ReopenVoting(ctx context.Context, sessionID int64) error {
	return s.setStatus(ctx, sessionID, domain.VotingOpen, realtime.EventVotingReopened)
}

func (s *VotingService) CancelVoting(ctx context.Context, sessionID int64) error {
	return s.setStatus(ctx, sessionID, domain.VotingCancelled, realtime.EventVotingCancelled)
}

func (s *VotingService) SaveResult(ctx context.Context, sessionID int64) error {
	var revision int64
	var resolutionChanged bool
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		votes := repository.NewVotingRepository(tx)
		session, err := votes.Get(ctx, sessionID)
		if err != nil {
			return err
		}
		if session == nil {
			return NewUserError("not_found", "Hlasování nebylo nalezeno.")
		}
		if session.Status != domain.VotingClosed {
			return NewUserError("voting_not_closed", "Výsledek lze uložit až po ukončení hlasování.")
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "voting")
		if err != nil {
			return err
		}
		if err := votes.SetStatus(ctx, sessionID, domain.VotingSaved, revision); err != nil {
			return err
		}
		if session.AmendmentID != nil {
			amendments := repository.NewAmendmentRepository(tx)
			amendment, err := amendments.Get(ctx, *session.AmendmentID)
			if err != nil {
				return err
			}
			allVotes, err := votes.Votes(ctx, sessionID)
			if err != nil {
				return err
			}
			counts := countVotes(allVotes)
			if amendment != nil && counts.For > counts.Against {
				if err := s.resolution.ApplyPassedAmendment(ctx, tx, *amendment); err != nil {
					return err
				}
				if err := amendments.SetStatus(ctx, amendment.ID, domain.AmendmentPassed); err != nil {
					return err
				}
				if _, err := events.BumpRevision(ctx, "resolution"); err != nil {
					return err
				}
				resolutionChanged = true
			} else if amendment != nil {
				if err := amendments.SetStatus(ctx, amendment.ID, domain.AmendmentFailed); err != nil {
					return err
				}
			}
		}
		return events.Log(ctx, realtime.EventVotingSaved, "admin", "", map[string]any{"sessionId": sessionID})
	})
	if err == nil {
		state, _ := s.GetCurrentVotingState(ctx, nil, true)
		s.hub.Publish(realtime.Event{Type: realtime.EventVotingSaved, Revision: revision, Payload: state})
		if resolutionChanged {
			res, _ := s.resolution.GetCurrentResolution(ctx)
			s.hub.Publish(realtime.Event{Type: realtime.EventResolutionUpdated, Revision: res.Revision, Payload: res})
		}
	}
	return err
}

func (s *VotingService) AutoCloseExpiredVoting(ctx context.Context) error {
	expired, err := repository.NewVotingRepository(s.db).ExpiredOpen(ctx, time.Now().UTC())
	if err != nil {
		return err
	}
	for _, session := range expired {
		if err := s.CloseVoting(ctx, session.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *VotingService) ForceProjectionUpdate(ctx context.Context) error {
	state, err := s.GetCurrentVotingState(ctx, nil, true)
	if err != nil {
		return err
	}
	s.hub.Publish(realtime.Event{Type: realtime.EventVotingUpdated, Revision: state.Revision, Payload: state})
	return nil
}

func (s *VotingService) GetCurrentVotingState(ctx context.Context, delegateID *int64, includeVotes bool) (domain.VotingState, error) {
	session, err := repository.NewVotingRepository(s.db).Current(ctx)
	if err != nil {
		return domain.VotingState{}, err
	}
	resolution, err := s.resolution.GetCurrentResolution(ctx)
	if err != nil {
		return domain.VotingState{}, err
	}
	revision, err := repository.NewEventRepository(s.db).Revision(ctx, "voting")
	if err != nil {
		return domain.VotingState{}, err
	}
	state := domain.VotingState{Revision: revision, Session: session, Resolution: resolution}
	if session == nil {
		return state, nil
	}
	state.Revision = session.Revision
	if session.AmendmentID != nil {
		state.Amendment, _ = repository.NewAmendmentRepository(s.db).Get(ctx, *session.AmendmentID)
	}
	votes, err := repository.NewVotingRepository(s.db).Votes(ctx, session.ID)
	if err != nil {
		return domain.VotingState{}, err
	}
	state.Counts = countVotes(votes)
	if delegateID != nil {
		for _, vote := range votes {
			if vote.DelegationID == *delegateID {
				state.CurrentVote = vote.Choice
				break
			}
		}
	}
	if includeVotes {
		state.Votes = votes
	}
	return state, nil
}

func (s *VotingService) setStatus(ctx context.Context, sessionID int64, status, eventType string) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		votes := repository.NewVotingRepository(tx)
		session, err := votes.Get(ctx, sessionID)
		if err != nil {
			return err
		}
		if session == nil {
			return NewUserError("not_found", "Hlasování nebylo nalezeno.")
		}
		events := repository.NewEventRepository(tx)
		revision, err = events.BumpRevision(ctx, "voting")
		if err != nil {
			return err
		}
		if err := votes.SetStatus(ctx, sessionID, status, revision); err != nil {
			return err
		}
		return events.Log(ctx, eventType, "admin", "", map[string]any{"sessionId": sessionID})
	})
	if err == nil {
		state, _ := s.GetCurrentVotingState(ctx, nil, true)
		s.hub.Publish(realtime.Event{Type: eventType, Revision: revision, Payload: state})
	}
	return err
}

func countVotes(votes []domain.Vote) domain.VoteCounts {
	var counts domain.VoteCounts
	for _, vote := range votes {
		switch vote.Choice {
		case domain.VoteFor:
			counts.For++
		case domain.VoteAgainst:
			counts.Against++
		case domain.VoteAbstain:
			counts.Abstain++
		case domain.VoteAbsent:
			counts.Absent++
		}
	}
	return counts
}

func strconvFormatInt(id int64) string {
	return strconv.FormatInt(id, 10)
}
