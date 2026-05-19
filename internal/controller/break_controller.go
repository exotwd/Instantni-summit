package controller

import "net/http"

func (api *API) StartBreak(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type            string `json:"type"`
		Title           string `json:"title"`
		DurationMinutes int    `json:"durationMinutes"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatná přestávka.")
		return
	}
	item, err := api.breaks.StartBreak(r.Context(), req.Type, req.Title, req.DurationMinutes)
	respond(w, item, err)
}

func (api *API) EndBreak(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.breaks.EndBreak(r.Context()))
}

func (api *API) ActiveBreak(w http.ResponseWriter, r *http.Request) {
	item, err := api.breaks.GetActiveBreak(r.Context())
	respond(w, item, err)
}
