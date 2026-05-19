package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

func (api *API) ListAgenda(w http.ResponseWriter, r *http.Request) {
	items, err := api.agenda.ListAgenda(r.Context())
	respond(w, items, err)
}

func (api *API) CreateAgenda(w http.ResponseWriter, r *http.Request) {
	var item domain.AgendaItem
	if err := decode(r, &item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný bod programu.")
		return
	}
	created, err := api.agenda.CreateAgendaItem(r.Context(), item)
	respond(w, created, err)
}

func (api *API) UpdateAgenda(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID programu.")
		return
	}
	var item domain.AgendaItem
	if err := decode(r, &item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný bod programu.")
		return
	}
	item.ID = id
	respond(w, map[string]string{"status": "ok"}, api.agenda.UpdateAgendaItem(r.Context(), item))
}

func (api *API) DeleteAgenda(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID programu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.agenda.DeleteAgendaItem(r.Context(), id))
}

func (api *API) ReorderAgenda(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatné pořadí programu.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.agenda.ReorderAgendaItems(r.Context(), req.IDs))
}
