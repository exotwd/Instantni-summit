package service

import (
	"context"
	"database/sql"

	"mun-app/internal/domain"
	"mun-app/internal/repository"
)

type AdminState struct {
	Settings    domain.SettingsSnapshot  `json:"settings"`
	Attendance  domain.AttendanceSnapshot `json:"attendance"`
	Delegations []domain.Delegation       `json:"delegations"`
	Resolution  domain.ResolutionSnapshot `json:"resolution"`
	Amendments  []domain.Amendment        `json:"amendments"`
	Voting      domain.VotingState        `json:"voting"`
	Speakers    domain.SpeakerSnapshot    `json:"speakers"`
	Break       *domain.Break             `json:"break,omitempty"`
	Agenda      []domain.AgendaItem       `json:"agenda"`
	Debate      domain.DebateState        `json:"debate"`
}

type ScreenState struct {
	Settings    domain.SettingsSnapshot     `json:"settings"`
	Delegations []domain.PublicDelegation   `json:"delegations"`
	Resolution  domain.ResolutionSnapshot   `json:"resolution"`
	Voting      domain.VotingState          `json:"voting"`
	Speakers    domain.SpeakerSnapshot      `json:"speakers"`
	Break       *domain.Break               `json:"break,omitempty"`
	Debate      domain.DebateState          `json:"debate"`
}

type VoteState struct {
	Delegation domain.PublicDelegation   `json:"delegation"`
	Voting     domain.VotingState        `json:"voting"`
	Resolution domain.ResolutionSnapshot `json:"resolution"`
}

type ScreenService struct {
	db         *sql.DB
	settings  *SettingsService
	attendance *AttendanceService
	resolution *ResolutionService
	amendments *AmendmentService
	voting    *VotingService
	speakers  *SpeakerService
	breaks    *BreakService
	agenda    *AgendaService
}

func NewScreenService(db *sql.DB, settings *SettingsService, attendance *AttendanceService, resolution *ResolutionService, amendments *AmendmentService, voting *VotingService, speakers *SpeakerService, breaks *BreakService, agenda *AgendaService) *ScreenService {
	return &ScreenService{db: db, settings: settings, attendance: attendance, resolution: resolution, amendments: amendments, voting: voting, speakers: speakers, breaks: breaks, agenda: agenda}
}

func (s *ScreenService) AdminState(ctx context.Context) (AdminState, error) {
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return AdminState{}, err
	}
	attendance, err := s.attendance.List(ctx)
	if err != nil {
		return AdminState{}, err
	}
	resolution, err := s.resolution.GetCurrentResolution(ctx)
	if err != nil {
		return AdminState{}, err
	}
	amendments, err := s.amendments.List(ctx)
	if err != nil {
		return AdminState{}, err
	}
	voting, err := s.voting.GetCurrentVotingState(ctx, nil, true)
	if err != nil {
		return AdminState{}, err
	}
	speakers, err := s.speakers.Snapshot(ctx)
	if err != nil {
		return AdminState{}, err
	}
	activeBreak, err := s.breaks.GetActiveBreak(ctx)
	if err != nil {
		return AdminState{}, err
	}
	agenda, err := s.agenda.ListAgenda(ctx)
	if err != nil {
		return AdminState{}, err
	}
	debate, err := s.amendments.DebateState(ctx)
	if err != nil {
		return AdminState{}, err
	}
	return AdminState{Settings: settings, Attendance: attendance, Delegations: attendance.Delegations, Resolution: resolution, Amendments: amendments, Voting: voting, Speakers: speakers, Break: activeBreak, Agenda: agenda, Debate: debate}, nil
}

func (s *ScreenService) ScreenState(ctx context.Context) (ScreenState, error) {
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return ScreenState{}, err
	}
	delegations, err := repository.NewDelegationRepository(s.db).List(ctx, false)
	if err != nil {
		return ScreenState{}, err
	}
	public := make([]domain.PublicDelegation, 0, len(delegations))
	for _, d := range delegations {
		public = append(public, d.Public())
	}
	resolution, err := s.resolution.GetCurrentResolution(ctx)
	if err != nil {
		return ScreenState{}, err
	}
	voting, err := s.voting.GetCurrentVotingState(ctx, nil, true)
	if err != nil {
		return ScreenState{}, err
	}
	speakers, err := s.speakers.Snapshot(ctx)
	if err != nil {
		return ScreenState{}, err
	}
	activeBreak, err := s.breaks.GetActiveBreak(ctx)
	if err != nil {
		return ScreenState{}, err
	}
	debate, err := s.amendments.DebateState(ctx)
	if err != nil {
		return ScreenState{}, err
	}
	return ScreenState{Settings: settings, Delegations: public, Resolution: resolution, Voting: voting, Speakers: speakers, Break: activeBreak, Debate: debate}, nil
}

func (s *ScreenService) VoteState(ctx context.Context, delegationID int64) (VoteState, error) {
	delegation, err := repository.NewDelegationRepository(s.db).Get(ctx, delegationID, false)
	if err != nil {
		return VoteState{}, err
	}
	if delegation == nil {
		return VoteState{}, NewUserError("not_found", "Delegace nebyla nalezena.")
	}
	voting, err := s.voting.GetCurrentVotingState(ctx, &delegationID, false)
	if err != nil {
		return VoteState{}, err
	}
	return VoteState{Delegation: delegation.Public(), Voting: voting, Resolution: voting.Resolution}, nil
}
