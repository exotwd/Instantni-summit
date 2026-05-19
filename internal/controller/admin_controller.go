package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"mun-app/internal/config"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/service"
)

const (
	adminCookie    = "mun_admin_session"
	screenCookie   = "mun_screen_session"
	delegateCookie = "mun_delegate_session"
)

type API struct {
	cfg         config.Config
	hub         *realtime.Hub
	auth        *service.AuthService
	settings    *service.SettingsService
	attendance  *service.AttendanceService
	delegations *service.DelegationService
	resolution  *service.ResolutionService
	amendments  *service.AmendmentService
	voting      *service.VotingService
	speakers    *service.SpeakerService
	breaks      *service.BreakService
	agenda      *service.AgendaService
	screen      *service.ScreenService
}

func NewAPI(cfg config.Config, hub *realtime.Hub, auth *service.AuthService, settings *service.SettingsService, attendance *service.AttendanceService, delegations *service.DelegationService, resolution *service.ResolutionService, amendments *service.AmendmentService, voting *service.VotingService, speakers *service.SpeakerService, breaks *service.BreakService, agenda *service.AgendaService, screen *service.ScreenService) *API {
	return &API{cfg: cfg, hub: hub, auth: auth, settings: settings, attendance: attendance, delegations: delegations, resolution: resolution, amendments: amendments, voting: voting, speakers: speakers, breaks: breaks, agenda: agenda, screen: screen}
}

func (api *API) AdminState(w http.ResponseWriter, r *http.Request) {
	state, err := api.screen.AdminState(r.Context())
	respond(w, state, err)
}

func (api *API) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(adminCookie)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Přihlaste se jako administrátor.")
			return
		}
		ok, err := api.auth.ValidateToken(r.Context(), domain.RoleAdmin, cookie.Value)
		if err != nil || !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Přihlaste se jako administrátor.")
			return
		}
		next(w, r)
	}
}

func (api *API) RequireScreen(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(screenCookie)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Přihlaste se pro projekci.")
			return
		}
		ok, err := api.auth.ValidateToken(r.Context(), domain.RoleScreen, cookie.Value)
		if err != nil || !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Přihlaste se pro projekci.")
			return
		}
		next(w, r)
	}
}

func (api *API) RequireDelegate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := api.delegateID(r); !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Přihlaste se kódem delegace.")
			return
		}
		next(w, r)
	}
}

func (api *API) delegateID(r *http.Request) (int64, bool) {
	cookie, err := r.Cookie(delegateCookie)
	if err != nil {
		return 0, false
	}
	return api.auth.ValidateDelegateToken(cookie.Value)
}

func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, value)
}

func decode(r *http.Request, out any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(out)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeServiceError(w http.ResponseWriter, err error) {
	var userErr service.UserError
	if errors.As(err, &userErr) {
		writeError(w, http.StatusBadRequest, userErr.Code, userErr.Message)
		return
	}
	writeError(w, http.StatusInternalServerError, "internal_error", "Serverová chyba.")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func setCookie(w http.ResponseWriter, name, value string, expires time.Time, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: "/", Expires: expires, HttpOnly: true,
		SameSite: http.SameSiteLaxMode, Secure: secure,
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func pathID(r *http.Request) (int64, error) {
	return strconv.ParseInt(r.PathValue("id"), 10, 64)
}

type idRequest struct {
	ID           int64 `json:"id"`
	SessionID    int64 `json:"sessionId"`
	DelegationID int64 `json:"delegationId"`
}
