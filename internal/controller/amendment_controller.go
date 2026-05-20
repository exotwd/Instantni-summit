package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

func (api *API) ListAmendments(w http.ResponseWriter, r *http.Request) {
	items, err := api.amendments.List(r.Context())
	respond(w, items, err)
}

func (api *API) CreateAmendment(w http.ResponseWriter, r *http.Request) {
	var item domain.Amendment
	if err := decode(r, &item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný pozměňovací návrh.")
		return
	}
	created, err := api.amendments.Create(r.Context(), item)
	respond(w, created, err)
}

func (api *API) UpdateAmendment(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID návrhu.")
		return
	}
	var item domain.Amendment
	if err := decode(r, &item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný pozměňovací návrh.")
		return
	}
	item.ID = id
	respond(w, map[string]string{"status": "ok"}, api.amendments.Update(r.Context(), item))
}

func (api *API) IntroduceAmendment(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID návrhu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.amendments.Introduce(r.Context(), id))
}

func (api *API) AcceptAmendment(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID návrhu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.amendments.Accept(r.Context(), id))
}

func (api *API) RejectAmendment(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID návrhu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.amendments.Reject(r.Context(), id))
}

func (api *API) StartDebate(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID návrhu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.amendments.StartDebate(r.Context(), id))
}

func (api *API) SelectDebateDelegation(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DelegationID int64 `json:"delegationId"`
	}
	if err := decode(r, &req); err != nil || req.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "missing_delegation", "Chybí delegace.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.amendments.SelectDebateDelegation(r.Context(), req.DelegationID))
}

func (api *API) AdvanceDebate(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.amendments.AdvanceDebate(r.Context()))
}

func (api *API) CancelDebate(w http.ResponseWriter, r *http.Request) {
	respond(w, map[string]string{"status": "ok"}, api.amendments.CancelDebate(r.Context()))
}

func (api *API) Resolution(w http.ResponseWriter, r *http.Request) {
	state, err := api.resolution.GetCurrentResolution(r.Context())
	respond(w, state, err)
}
