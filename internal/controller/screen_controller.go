package controller

import (
	"net/http"

	"mun-app/internal/realtime"
)

func (api *API) ScreenState(w http.ResponseWriter, r *http.Request) {
	state, err := api.screen.ScreenState(r.Context())
	respond(w, state, err)
}

func (api *API) Events(w http.ResponseWriter, r *http.Request) {
	role := r.URL.Query().Get("role")
	switch role {
	case "admin":
		api.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
			realtime.Serve(w, r, api.hub, role)
		})(w, r)
	case "screen":
		api.RequireScreen(func(w http.ResponseWriter, r *http.Request) {
			realtime.Serve(w, r, api.hub, role)
		})(w, r)
	case "delegate":
		api.RequireDelegate(func(w http.ResponseWriter, r *http.Request) {
			realtime.Serve(w, r, api.hub, role)
		})(w, r)
	default:
		writeError(w, http.StatusBadRequest, "invalid_role", "Neplatná role realtime klienta.")
	}
}
