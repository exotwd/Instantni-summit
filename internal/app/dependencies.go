package app

import (
	"database/sql"

	"mun-app/internal/config"
	"mun-app/internal/controller"
	"mun-app/internal/realtime"
	"mun-app/internal/service"
)

type Dependencies struct {
	Hub         *realtime.Hub
	Auth        *service.AuthService
	Settings    *service.SettingsService
	Attendance  *service.AttendanceService
	Delegations *service.DelegationService
	Resolution  *service.ResolutionService
	Amendments  *service.AmendmentService
	Voting      *service.VotingService
	Speakers    *service.SpeakerService
	Breaks      *service.BreakService
	Agenda      *service.AgendaService
	Screen      *service.ScreenService
	API         *controller.API
}

func newDependencies(db *sql.DB, cfg config.Config) *Dependencies {
	hub := realtime.NewHub()
	auth := service.NewAuthService(db, cfg)
	settings := service.NewSettingsService(db, hub, cfg)
	attendance := service.NewAttendanceService(db, hub)
	delegations := service.NewDelegationService(db, hub)
	resolution := service.NewResolutionService(db, hub)
	amendments := service.NewAmendmentService(db, hub)
	speakers := service.NewSpeakerService(db, hub)
	breaks := service.NewBreakService(db, hub)
	agenda := service.NewAgendaService(db, hub)
	voting := service.NewVotingService(db, hub, settings, resolution)
	screen := service.NewScreenService(db, settings, attendance, resolution, amendments, voting, speakers, breaks, agenda)
	api := controller.NewAPI(cfg, hub, auth, settings, attendance, delegations, resolution, amendments, voting, speakers, breaks, agenda, screen)
	return &Dependencies{Hub: hub, Auth: auth, Settings: settings, Attendance: attendance, Delegations: delegations, Resolution: resolution, Amendments: amendments, Voting: voting, Speakers: speakers, Breaks: breaks, Agenda: agenda, Screen: screen, API: api}
}
