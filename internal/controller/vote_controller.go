package controller

import (
	"net/http"
	"time"

	"mun-app/internal/domain"
)

type voteLoginRequest struct {
	Code string `json:"code"`
}

type voteLinkLoginRequest struct {
	Token string `json:"token"`
}

type castVoteRequest struct {
	Choice string `json:"choice"`
}

func (api *API) VoteLogin(w http.ResponseWriter, r *http.Request) {
	var req voteLoginRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	delegation, err := api.attendance.LoginByCode(r.Context(), req.Code)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	token := api.auth.DelegateToken(delegation.ID)
	setCookie(w, delegateCookie, token, time.Now().Add(api.cfg.DelegateTokenTTL), api.cfg.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]any{"delegation": delegation.Public()})
}

func (api *API) VoteLinkLogin(w http.ResponseWriter, r *http.Request) {
	var req voteLinkLoginRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	delegation, err := api.attendance.LoginByVoteLink(r.Context(), req.Token)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	token := api.auth.DelegateToken(delegation.ID)
	setCookie(w, delegateCookie, token, time.Now().Add(api.cfg.DelegateTokenTTL), api.cfg.CookieSecure)
	writeJSON(w, http.StatusOK, map[string]any{"delegation": delegation.Public()})
}

func (api *API) VoteState(w http.ResponseWriter, r *http.Request) {
	id, _ := api.delegateID(r)
	state, err := api.screen.VoteState(r.Context(), id)
	respond(w, state, err)
}

func (api *API) VoteCast(w http.ResponseWriter, r *http.Request) {
	var req castVoteRequest
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	id, _ := api.delegateID(r)
	state, err := api.voting.CastVote(r.Context(), id, req.Choice, domain.SourceDelegate)
	respond(w, state, err)
}

func (api *API) VoteAmendment(w http.ResponseWriter, r *http.Request) {
	var amendment domain.Amendment
	if err := decode(r, &amendment); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný požadavek.")
		return
	}
	id, _ := api.delegateID(r)
	created, err := api.amendments.SubmitFromDelegate(r.Context(), id, amendment)
	respond(w, created, err)
}
