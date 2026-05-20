package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

type loginRequest struct {
	PIN string `json:"pin"`
}

func (api *API) AdminLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	token, expires, err := api.auth.Login(r.Context(), domain.RoleAdmin, req.PIN)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	setCookie(w, adminCookie, token, expires, api.cfg.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]any{"role": domain.RoleAdmin, "expiresAt": expires})
}

func (api *API) ScreenLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	token, expires, err := api.auth.Login(r.Context(), domain.RoleScreen, req.PIN)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	setCookie(w, screenCookie, token, expires, api.cfg.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]any{"role": domain.RoleScreen, "expiresAt": expires})
}

func (api *API) Logout(w http.ResponseWriter, r *http.Request) {
	role := r.URL.Query().Get("role")
	if role == "" {
		role = domain.RoleAdmin
	}
	cookies := map[string]string{
		domain.RoleAdmin:    adminCookie,
		domain.RoleScreen:   screenCookie,
		domain.RoleDelegate: delegateCookie,
	}
	name, ok := cookies[role]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid_role", "Neplatná role pro odhlášení.")
		return
	}
	if cookie, err := r.Cookie(name); err == nil && role != domain.RoleDelegate {
		_ = api.auth.Logout(r.Context(), cookie.Value)
	}
	clearCookie(w, name)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (api *API) Me(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(adminCookie); err == nil {
		ok, _ := api.auth.ValidateToken(r.Context(), domain.RoleAdmin, cookie.Value)
		if ok {
			writeJSON(w, http.StatusOK, map[string]string{"role": domain.RoleAdmin})
			return
		}
	}
	if cookie, err := r.Cookie(screenCookie); err == nil {
		ok, _ := api.auth.ValidateToken(r.Context(), domain.RoleScreen, cookie.Value)
		if ok {
			writeJSON(w, http.StatusOK, map[string]string{"role": domain.RoleScreen})
			return
		}
	}
	if id, ok := api.delegateID(r); ok {
		writeJSON(w, http.StatusOK, map[string]any{"role": domain.RoleDelegate, "delegationId": id})
		return
	}
	writeError(w, http.StatusUnauthorized, "unauthorized", "Nejste přihlášeni.")
}
