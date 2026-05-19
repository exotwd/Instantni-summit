package controller

import "net/http"

func (api *API) AddSpeaker(w http.ResponseWriter, r *http.Request) {
	id, ok := delegationIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.speakers.AddSpeaker(r.Context(), id))
}

func (api *API) AddReaction(w http.ResponseWriter, r *http.Request) {
	id, ok := delegationIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.speakers.AddReaction(r.Context(), id))
}

func (api *API) NextSpeaker(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.speakers.NextSpeaker(r.Context()))
}

func (api *API) RemoveSpeaker(w http.ResponseWriter, r *http.Request) {
	var req idRequest
	if err := decode(r, &req); err != nil || req.ID == 0 {
		writeError(w, http.StatusBadRequest, "missing_id", "Chybí položka pořadníku.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.speakers.RemoveSpeaker(r.Context(), req.ID))
}

func (api *API) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	var req idRequest
	if err := decode(r, &req); err != nil || req.ID == 0 {
		writeError(w, http.StatusBadRequest, "missing_id", "Chybí reakce.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.speakers.RemoveReaction(r.Context(), req.ID))
}

func (api *API) ClearSpeakers(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.speakers.Clear(r.Context()))
}

func delegationIDFromRequest(w http.ResponseWriter, r *http.Request) (int64, bool) {
	var req idRequest
	if err := decode(r, &req); err != nil || req.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "missing_delegation", "Chybí delegace.")
		return 0, false
	}
	return req.DelegationID, true
}
