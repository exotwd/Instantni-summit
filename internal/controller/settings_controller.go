package controller

import "net/http"

func (api *API) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := api.settings.GetSettings(r.Context())
	respond(w, settings, err)
}

func (api *API) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req map[string]string
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatná nastavení.")
		return
	}
	revision, err := api.settings.UpdateSettings(r.Context(), req)
	respond(w, map[string]any{"revision": revision}, err)
}

func (api *API) ChangeAdminPIN(w http.ResponseWriter, r *http.Request) {
	api.changePIN(w, r, true)
}

func (api *API) ChangeScreenPIN(w http.ResponseWriter, r *http.Request) {
	api.changePIN(w, r, false)
}

func (api *API) changePIN(w http.ResponseWriter, r *http.Request, admin bool) {
	var req struct {
		PIN string `json:"pin"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný PIN.")
		return
	}
	var err error
	if admin {
		err = api.settings.ChangeAdminPIN(r.Context(), req.PIN)
	} else {
		err = api.settings.ChangeScreenPIN(r.Context(), req.PIN)
	}
	respond(w, map[string]string{"status": "ok"}, err)
}

func (api *API) ResetLive(w http.ResponseWriter, r *http.Request) {
	revision, err := api.settings.ResetLiveData(r.Context())
	respond(w, map[string]any{"revision": revision}, err)
}

func (api *API) ResetAll(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Confirm string `json:"confirm"`
	}
	if err := decode(r, &req); err != nil || req.Confirm != "RESET ALL" {
		writeError(w, http.StatusBadRequest, "confirmation_required", "Pro reset všech dat napište RESET ALL.")
		return
	}
	revision, err := api.settings.ResetAllData(r.Context())
	respond(w, map[string]any{"revision": revision}, err)
}

func (api *API) DeleteStoredData(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Scope   string `json:"scope"`
		Confirm string `json:"confirm"`
	}
	if err := decode(r, &req); err != nil || req.Confirm != "SMAZAT" {
		writeError(w, http.StatusBadRequest, "confirmation_required", "Pro smazĂˇnĂ­ dat napiĹˇte SMAZAT.")
		return
	}
	revision, err := api.settings.DeleteStoredData(r.Context(), req.Scope)
	respond(w, map[string]any{"revision": revision}, err)
}
