package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"mun-app/internal/config"
	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type testServices struct {
	cfg        config.Config
	hub        *realtime.Hub
	auth       *AuthService
	settings   *SettingsService
	attendance *AttendanceService
	resolution *ResolutionService
	amendments *AmendmentService
	voting     *VotingService
	speakers   *SpeakerService
	breaks     *BreakService
	agenda     *AgendaService
}

func newTestServices(t *testing.T) (*testServices, func()) {
	t.Helper()
	cfg := config.Config{
		DBPath: filepath.Join(t.TempDir(), "mun.db"), MigrationsPath: filepath.Join("..", "..", "migrations"),
		BackupDir: t.TempDir(), AppSecret: "test-secret", AdminTokenTTL: time.Hour, ScreenTokenTTL: time.Hour,
		DelegateTokenTTL: time.Hour, DefaultAdminPIN: "1234", DefaultScreenPIN: "5678",
	}
	db, err := database.OpenSQLite(cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.RunMigrations(context.Background(), db, cfg.MigrationsPath); err != nil {
		t.Fatal(err)
	}
	hub := realtime.NewHub()
	auth := NewAuthService(db, cfg)
	settings := NewSettingsService(db, hub, cfg)
	attendance := NewAttendanceService(db, hub)
	resolution := NewResolutionService(db, hub)
	amendments := NewAmendmentService(db, hub)
	voting := NewVotingService(db, hub, settings, resolution)
	speakers := NewSpeakerService(db, hub)
	breaks := NewBreakService(db, hub)
	agenda := NewAgendaService(db, hub)
	if err := auth.EnsureDefaults(context.Background()); err != nil {
		t.Fatal(err)
	}
	return &testServices{cfg: cfg, hub: hub, auth: auth, settings: settings, attendance: attendance, resolution: resolution, amendments: amendments, voting: voting, speakers: speakers, breaks: breaks, agenda: agenda}, func() { _ = db.Close() }
}

func TestVotingFlowClosedReopenedAndSaveAppliesAmendment(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	amendment, err := s.amendments.Create(ctx, domain.Amendment{Type: domain.AmendmentAdd, Text: "Nový bod rezoluce"})
	if err != nil {
		t.Fatal(err)
	}
	state, err := s.voting.StartVoting(ctx, &amendment.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.voting.CastVote(ctx, 1, domain.VoteFor, domain.SourceDelegate); err != nil {
		t.Fatal(err)
	}
	afterVote, err := s.voting.GetCurrentVotingState(ctx, nil, true)
	if err != nil {
		t.Fatal(err)
	}
	if afterVote.Revision <= state.Revision || afterVote.Counts.For != 1 {
		t.Fatalf("vote did not update revision/counts: %#v", afterVote)
	}
	if err := s.voting.CloseVoting(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.voting.CastVote(ctx, 1, domain.VoteAgainst, domain.SourceDelegate); err == nil {
		t.Fatal("closed voting accepted delegate vote")
	}
	if err := s.voting.ReopenVoting(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.voting.CastVote(ctx, 2, domain.VoteFor, domain.SourceDelegate); err != nil {
		t.Fatal(err)
	}
	if err := s.voting.CloseVoting(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.voting.SaveResult(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
	resolution, err := s.resolution.GetCurrentResolution(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, point := range resolution.Points {
		if point.Text == "Nový bod rezoluce" {
			found = true
		}
	}
	if !found {
		t.Fatal("saved passed amendment was not applied to resolution")
	}
}

func TestSaveRequiresClosedVoting(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	state, err := s.voting.StartVoting(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.voting.SaveResult(ctx, state.Session.ID); err == nil {
		t.Fatal("save result succeeded before voting was closed")
	}
}

func TestUpdateAndRemoveAmendmentModifyResolution(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	added, err := s.amendments.Create(ctx, domain.Amendment{Type: domain.AmendmentAdd, Text: "Nový měnitelný bod"})
	if err != nil {
		t.Fatal(err)
	}
	passAmendment(t, s, added.ID)
	resolution, _ := s.resolution.GetCurrentResolution(ctx)
	target := resolution.Points[len(resolution.Points)-2].ID
	update, err := s.amendments.Create(ctx, domain.Amendment{Type: domain.AmendmentUpdate, TargetPointID: &target, Text: "Aktualizovaný bod"})
	if err != nil {
		t.Fatal(err)
	}
	passAmendment(t, s, update.ID)
	resolution, _ = s.resolution.GetCurrentResolution(ctx)
	resolution.Points = []domain.ResolutionPoint{resolution.Points[len(resolution.Points)-2]}
	if resolution.Points[0].Text != "Aktualizovaný bod" {
		t.Fatalf("point not updated: %s", resolution.Points[0].Text)
	}
	remove, err := s.amendments.Create(ctx, domain.Amendment{Type: domain.AmendmentRemove, TargetPointID: &target, Text: "remove"})
	if err != nil {
		t.Fatal(err)
	}
	passAmendment(t, s, remove.ID)
	resolution, _ = s.resolution.GetCurrentResolution(ctx)
	for _, point := range resolution.Points {
		if point.ID == target {
			t.Fatal("removed point is still visible in current resolution")
		}
	}
}

func passAmendment(t *testing.T, s *testServices, amendmentID int64) {
	t.Helper()
	ctx := context.Background()
	state, err := s.voting.StartVoting(ctx, &amendmentID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.voting.CastVote(ctx, 1, domain.VoteFor, domain.SourceAdmin); err != nil {
		t.Fatal(err)
	}
	if err := s.voting.CloseVoting(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.voting.SaveResult(ctx, state.Session.ID); err != nil {
		t.Fatal(err)
	}
}

func TestSpeakerQueueAndReactionRules(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	if err := s.speakers.AddSpeaker(ctx, 1); err != nil {
		t.Fatal(err)
	}
	if err := s.speakers.AddSpeaker(ctx, 1); err == nil {
		t.Fatal("duplicate speaker accepted")
	}
	if err := s.speakers.NextSpeaker(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.speakers.AddReaction(ctx, 2); err != nil {
		t.Fatal(err)
	}
	if err := s.speakers.AddReaction(ctx, 2); err == nil {
		t.Fatal("duplicate reaction accepted")
	}
	if err := s.speakers.AddReaction(ctx, 3); err != nil {
		t.Fatal(err)
	}
	if err := s.speakers.AddReaction(ctx, 4); err == nil {
		t.Fatal("third reaction accepted")
	}
	if err := s.speakers.NextSpeaker(ctx); err != nil {
		t.Fatal(err)
	}
	if err := s.speakers.AddReaction(ctx, 4); err == nil {
		t.Fatal("reaction after active reaction started accepted")
	}
}

func TestAttendanceCodeGenerationAndDelegateLogin(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	code, err := s.attendance.GenerateAccessCode(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(code) != 4 {
		t.Fatalf("expected 4 digit code, got %q", code)
	}
	delegation, err := s.attendance.LoginByCode(ctx, code)
	if err != nil {
		t.Fatal(err)
	}
	if delegation.ID != 1 {
		t.Fatalf("wrong delegation: %d", delegation.ID)
	}
}

func TestAuthRejectsUnauthorizedAndAcceptsDefaults(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	if _, _, err := s.auth.Login(ctx, domain.RoleAdmin, "0000"); err == nil {
		t.Fatal("bad admin pin accepted")
	}
	if _, _, err := s.auth.Login(ctx, domain.RoleScreen, "0000"); err == nil {
		t.Fatal("bad screen pin accepted")
	}
	token, _, err := s.auth.Login(ctx, domain.RoleAdmin, "1234")
	if err != nil {
		t.Fatal(err)
	}
	ok, err := s.auth.ValidateToken(ctx, domain.RoleAdmin, token)
	if err != nil || !ok {
		t.Fatal("valid admin token rejected")
	}
}

func TestAgendaCRUD(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	item, err := s.agenda.CreateAgendaItem(ctx, domain.AgendaItem{Title: "Úvod", Type: domain.AgendaSession})
	if err != nil {
		t.Fatal(err)
	}
	item.Title = "Zahájení"
	if err := s.agenda.UpdateAgendaItem(ctx, *item); err != nil {
		t.Fatal(err)
	}
	items, _ := s.agenda.ListAgenda(ctx)
	if len(items) != 1 || items[0].Title != "Zahájení" {
		t.Fatalf("agenda update failed: %#v", items)
	}
	if err := s.agenda.DeleteAgendaItem(ctx, item.ID); err != nil {
		t.Fatal(err)
	}
	items, _ = s.agenda.ListAgenda(ctx)
	if len(items) != 0 {
		t.Fatal("agenda delete failed")
	}
}

func TestResetLiveAndResetAll(t *testing.T) {
	s, closeDB := newTestServices(t)
	defer closeDB()
	ctx := context.Background()
	if _, err := s.voting.StartVoting(ctx, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := s.settings.ResetLiveData(ctx); err != nil {
		t.Fatal(err)
	}
	voting, _ := s.voting.GetCurrentVotingState(ctx, nil, true)
	if voting.Session != nil {
		t.Fatal("reset live left active voting visible")
	}
	if _, err := s.settings.ResetAllData(ctx); err != nil {
		t.Fatal(err)
	}
	delegations, err := repository.NewDelegationRepository(s.voting.db).List(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(delegations) != 27 {
		t.Fatalf("reset all did not reseed EU delegations, got %d", len(delegations))
	}
}
