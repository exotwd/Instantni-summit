package controller

import (
	"net/http"

	"mun-app/internal/domain"
)

func (api *API) AttendanceList(w http.ResponseWriter, r *http.Request) {
	state, err := api.attendance.List(r.Context())
	respond(w, state, err)
}

func (api *API) CheckIn(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DelegationID int64              `json:"delegationId"`
		Participant  domain.Participant `json:"participant"`
		Note         string             `json:"note"`
	}
	if err := decode(r, &req); err != nil || req.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_json", "Vyberte delegaci.")
		return
	}
	code, err := api.attendance.CheckIn(r.Context(), req.DelegationID, req.Participant, req.Note)
	respond(w, map[string]string{"accessCode": code}, err)
}

func (api *API) CheckOut(w http.ResponseWriter, r *http.Request) {
	id, ok := delegationIDFromRequest(w, r)
	if !ok {
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.attendance.CheckOut(r.Context(), id))
}

func (api *API) GenerateCode(w http.ResponseWriter, r *http.Request) {
	id, ok := delegationIDFromRequest(w, r)
	if !ok {
		return
	}
	code, err := api.attendance.GenerateAccessCode(r.Context(), id)
	respond(w, map[string]string{"accessCode": code}, err)
}

func (api *API) UpdateParticipant(w http.ResponseWriter, r *http.Request) {
	var participant domain.Participant
	if err := decode(r, &participant); err != nil || participant.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatná data účastníka.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.attendance.UpdateParticipant(r.Context(), participant))
}

func (api *API) AttendanceImport(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Rows []domain.Participant `json:"rows"`
	}
	if err := decode(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "Neplatný import prezence.")
		return
	}
	for _, row := range req.Rows {
		if row.DelegationID == 0 {
			continue
		}
		if err := api.attendance.UpdateParticipant(r.Context(), row); err != nil {
			writeServiceError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"imported": len(req.Rows)})
}

func (api *API) AttendanceExport(w http.ResponseWriter, r *http.Request) {
	state, err := api.attendance.List(r.Context())
	respond(w, state, err)
}
