package app

import (
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"mun-app/internal/middleware"
)

func (a *App) routes() {
	api := a.deps.API
	post := methodGuard(http.MethodPost)
	put := methodGuard(http.MethodPut)
	a.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	a.mux.HandleFunc("POST /api/auth/admin/login", api.AdminLogin)
	a.mux.HandleFunc("POST /api/auth/screen/login", api.ScreenLogin)
	a.mux.HandleFunc("POST /api/auth/logout", api.Logout)
	a.mux.HandleFunc("GET /api/auth/me", api.Me)
	a.mux.HandleFunc("GET /api/events", api.Events)

	a.mux.HandleFunc("GET /api/admin/state", api.RequireAdmin(api.AdminState))
	a.mux.HandleFunc("GET /api/screen/state", api.RequireScreen(api.ScreenState))
	a.mux.HandleFunc("POST /api/vote/login", api.VoteLogin)
	a.mux.HandleFunc("POST /api/vote/link-login", api.VoteLinkLogin)
	a.mux.HandleFunc("/api/vote/link-login", post(api.VoteLinkLogin))
	a.mux.HandleFunc("GET /api/vote/state", api.RequireDelegate(api.VoteState))
	a.mux.HandleFunc("POST /api/vote/cast", api.RequireDelegate(api.VoteCast))
	a.mux.HandleFunc("POST /api/vote/amendments", api.RequireDelegate(api.VoteAmendment))

	a.mux.HandleFunc("POST /api/admin/voting/start", api.RequireAdmin(api.StartVoting))
	a.mux.HandleFunc("POST /api/admin/voting/cast", api.RequireAdmin(api.AdminCastVote))
	a.mux.HandleFunc("POST /api/admin/voting/close", api.RequireAdmin(api.CloseVoting))
	a.mux.HandleFunc("POST /api/admin/voting/reopen", api.RequireAdmin(api.ReopenVoting))
	a.mux.HandleFunc("POST /api/admin/voting/save", api.RequireAdmin(api.SaveVoting))
	a.mux.HandleFunc("POST /api/admin/voting/optical", api.RequireAdmin(api.SaveOpticalVoting))
	a.mux.HandleFunc("POST /api/admin/voting/cancel", api.RequireAdmin(api.CancelVoting))
	a.mux.HandleFunc("POST /api/admin/voting/force-projection", api.RequireAdmin(api.ForceProjection))

	a.mux.HandleFunc("POST /api/speakers/add", api.RequireAdmin(api.AddSpeaker))
	a.mux.HandleFunc("POST /api/speakers/reaction", api.RequireAdmin(api.AddReaction))
	a.mux.HandleFunc("POST /api/speakers/next", api.RequireAdmin(api.NextSpeaker))
	a.mux.HandleFunc("POST /api/speakers/remove", api.RequireAdmin(api.RemoveSpeaker))
	a.mux.HandleFunc("POST /api/speakers/reaction/remove", api.RequireAdmin(api.RemoveReaction))
	a.mux.HandleFunc("POST /api/speakers/clear", api.RequireAdmin(api.ClearSpeakers))

	a.mux.HandleFunc("GET /api/attendance", api.RequireAdmin(api.AttendanceList))
	a.mux.HandleFunc("POST /api/attendance/check-in", api.RequireAdmin(api.CheckIn))
	a.mux.HandleFunc("POST /api/attendance/check-out", api.RequireAdmin(api.CheckOut))
	a.mux.HandleFunc("POST /api/attendance/generate-code", api.RequireAdmin(api.GenerateCode))
	a.mux.HandleFunc("POST /api/attendance/generate-links", api.RequireAdmin(api.GenerateVoteLinks))
	a.mux.HandleFunc("POST /api/attendance/access-code-enabled", api.RequireAdmin(api.SetAccessCodeEnabled))
	a.mux.HandleFunc("POST /api/attendance/participant", api.RequireAdmin(api.UpdateParticipant))
	a.mux.HandleFunc("POST /api/attendance/import", api.RequireAdmin(api.AttendanceImport))
	a.mux.HandleFunc("POST /api/attendance/import-preferences", api.RequireAdmin(api.AttendancePreferenceImport))
	a.mux.HandleFunc("POST /api/attendance/export", api.RequireAdmin(api.AttendanceExport))
	a.mux.HandleFunc("POST /api/attendance/qr-codes", api.RequireAdmin(api.AttendanceQRExport))
	a.mux.HandleFunc("/api/attendance/generate-links", post(api.RequireAdmin(api.GenerateVoteLinks)))
	a.mux.HandleFunc("/api/attendance/check-in", post(api.RequireAdmin(api.CheckIn)))
	a.mux.HandleFunc("/api/attendance/check-out", post(api.RequireAdmin(api.CheckOut)))
	a.mux.HandleFunc("/api/attendance/generate-code", post(api.RequireAdmin(api.GenerateCode)))
	a.mux.HandleFunc("/api/attendance/access-code-enabled", post(api.RequireAdmin(api.SetAccessCodeEnabled)))
	a.mux.HandleFunc("/api/attendance/participant", post(api.RequireAdmin(api.UpdateParticipant)))
	a.mux.HandleFunc("/api/attendance/import", post(api.RequireAdmin(api.AttendanceImport)))
	a.mux.HandleFunc("/api/attendance/import-preferences", post(api.RequireAdmin(api.AttendancePreferenceImport)))
	a.mux.HandleFunc("/api/attendance/export", post(api.RequireAdmin(api.AttendanceExport)))
	a.mux.HandleFunc("/api/attendance/qr-codes", post(api.RequireAdmin(api.AttendanceQRExport)))

	a.mux.HandleFunc("GET /api/amendments", api.RequireAdmin(api.ListAmendments))
	a.mux.HandleFunc("POST /api/amendments", api.RequireAdmin(api.CreateAmendment))
	a.mux.HandleFunc("PUT /api/amendments/{id}", api.RequireAdmin(api.UpdateAmendment))
	a.mux.HandleFunc("POST /api/amendments/{id}/accept", api.RequireAdmin(api.AcceptAmendment))
	a.mux.HandleFunc("POST /api/amendments/{id}/introduce", api.RequireAdmin(api.IntroduceAmendment))
	a.mux.HandleFunc("POST /api/amendments/{id}/reject", api.RequireAdmin(api.RejectAmendment))
	a.mux.HandleFunc("POST /api/amendments/{id}/debate", api.RequireAdmin(api.StartDebate))
	a.mux.HandleFunc("/api/amendments/{id}/accept", post(api.RequireAdmin(api.AcceptAmendment)))
	a.mux.HandleFunc("/api/amendments/{id}/introduce", post(api.RequireAdmin(api.IntroduceAmendment)))
	a.mux.HandleFunc("/api/amendments/{id}/reject", post(api.RequireAdmin(api.RejectAmendment)))
	a.mux.HandleFunc("/api/amendments/{id}/debate", post(api.RequireAdmin(api.StartDebate)))
	a.mux.HandleFunc("POST /api/debate/select", api.RequireAdmin(api.SelectDebateDelegation))
	a.mux.HandleFunc("POST /api/debate/next", api.RequireAdmin(api.AdvanceDebate))
	a.mux.HandleFunc("POST /api/debate/cancel", api.RequireAdmin(api.CancelDebate))
	a.mux.HandleFunc("GET /api/resolution", api.RequireAdmin(api.Resolution))

	a.mux.HandleFunc("PUT /api/delegations/{id}", api.RequireAdmin(api.UpdateDelegation))
	a.mux.HandleFunc("POST /api/layout/seat", api.RequireAdmin(api.UpdateSeat))
	a.mux.HandleFunc("/api/delegations/{id}", put(api.RequireAdmin(api.UpdateDelegation)))
	a.mux.HandleFunc("/api/layout/seat", post(api.RequireAdmin(api.UpdateSeat)))

	a.mux.HandleFunc("POST /api/breaks/start", api.RequireAdmin(api.StartBreak))
	a.mux.HandleFunc("POST /api/breaks/end", api.RequireAdmin(api.EndBreak))
	a.mux.HandleFunc("GET /api/breaks/active", api.RequireAdmin(api.ActiveBreak))

	a.mux.HandleFunc("GET /api/agenda", api.RequireAdmin(api.ListAgenda))
	a.mux.HandleFunc("POST /api/agenda", api.RequireAdmin(api.CreateAgenda))
	a.mux.HandleFunc("PUT /api/agenda/{id}", api.RequireAdmin(api.UpdateAgenda))
	a.mux.HandleFunc("DELETE /api/agenda/{id}", api.RequireAdmin(api.DeleteAgenda))
	a.mux.HandleFunc("POST /api/agenda/reorder", api.RequireAdmin(api.ReorderAgenda))

	a.mux.HandleFunc("GET /api/settings", api.RequireAdmin(api.GetSettings))
	a.mux.HandleFunc("POST /api/settings", api.RequireAdmin(api.UpdateSettings))
	a.mux.HandleFunc("POST /api/settings/admin-pin", api.RequireAdmin(api.ChangeAdminPIN))
	a.mux.HandleFunc("POST /api/settings/screen-pin", api.RequireAdmin(api.ChangeScreenPIN))
	a.mux.HandleFunc("POST /api/settings/reset-live", api.RequireAdmin(api.ResetLive))
	a.mux.HandleFunc("POST /api/settings/reset-all", api.RequireAdmin(api.ResetAll))
	a.mux.HandleFunc("POST /api/settings/delete-data", api.RequireAdmin(api.DeleteStoredData))

	a.mux.Handle("/", middleware.CacheStatic(a.staticHandler()))
}

func methodGuard(method string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Method != method {
				w.Header().Set("Allow", method)
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusMethodNotAllowed)
				_, _ = w.Write([]byte(`{"error":{"code":"method_not_allowed","message":"Tato akce nepodporuje použitou HTTP metodu."}}`))
				return
			}
			next(w, r)
		}
	}
}

func (a *App) staticHandler() http.Handler {
	_ = mime.AddExtensionType(".ts", "application/javascript; charset=utf-8")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			http.Redirect(w, r, "/admin", http.StatusFound)
			return
		}
		if path == "admin" || path == "screen" || path == "vote" {
			http.ServeFile(w, r, filepath.Join(a.cfg.StaticDir, path, "index.html"))
			return
		}
		clean := filepath.Clean(path)
		if clean == "api" || strings.HasPrefix(clean, "api"+string(filepath.Separator)) || strings.HasPrefix(clean, "api/") {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":{"code":"not_found","message":"API endpoint nebyl nalezen. Zkontrolujte, že běží aktuální serverový build."}}`))
			return
		}
		if clean == "." || strings.HasPrefix(clean, "..") || strings.Contains(clean, string(filepath.Separator)+".."+string(filepath.Separator)) {
			http.NotFound(w, r)
			return
		}
		full := filepath.Join(a.cfg.StaticDir, clean)
		if _, err := os.Stat(full); err == nil {
			http.ServeFile(w, r, full)
			return
		}
		http.NotFound(w, r)
	})
}
