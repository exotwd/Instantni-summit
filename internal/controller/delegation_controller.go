package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

func (api *API) UpdateDelegation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "Neplatné ID delegace.")
		return
	}
	var d domain.Delegation
	if err := decode(r, &d); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatná delegace.")
		return
	}
	d.ID = id
	respond(w, map[string]string{"status": "ok"}, api.delegations.Update(r.Context(), d))
}

func (api *API) UpdateSeat(w http.ResponseWriter, r *http.Request) {
	var seat domain.SeatLayout
	if err := decode(r, &seat); err != nil || seat.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatné rozložení delegace.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.delegations.UpdateSeat(r.Context(), seat))
}
