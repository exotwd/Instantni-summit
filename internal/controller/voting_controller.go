package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

type startVotingRequest struct {
	AmendmentID *int64 `json:"amendmentId"`
}

func (api *API) StartVoting(w http.ResponseWriter, r *http.Request) {
	var req startVotingRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	state, err := api.voting.StartVoting(r.Context(), req.AmendmentID)
	respond(w, state, err)
}

func (api *API) CloseVoting(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.voting.CloseVoting(r.Context(), sessionID))
}

func (api *API) ReopenVoting(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.voting.ReopenVoting(r.Context(), sessionID))
}

func (api *API) SaveVoting(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.voting.SaveResult(r.Context(), sessionID))
}

func (api *API) CancelVoting(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := sessionIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.voting.CancelVoting(r.Context(), sessionID))
}

func (api *API) ForceProjection(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.voting.ForceProjectionUpdate(r.Context()))
}

func (api *API) AdminCastVote(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DelegationID int64  `json:"delegationId"`
		Choice       string `json:"choice"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	state, err := api.voting.CastVote(r.Context(), req.DelegationID, req.Choice, domain.SourceAdmin)
	respond(w, state, err)
}

func sessionIDFromRequest(w http.ResponseWriter, r *http.Request) (int64, bool) {
	var req idRequest
	if err := decode(r, &req); err != nil || req.SessionID == 0 {
		writeError(w, http.StatusBadRequest, "missing_session", "Chybí ID hlasování.")
		return 0, false
	}
	return req.SessionID, true
}
