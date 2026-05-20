package controller

import (
	"net/http"
	"strings"

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

func (api *API) GenerateVoteLinks(w http.ResponseWriter, r *http.Request) {
	state, err := api.attendance.GenerateVoteLinks(r.Context())
	respond(w, state, err)
}

func (api *API) SetAccessCodeEnabled(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DelegationID int64 `json:"delegationId"`
		Enabled      bool  `json:"enabled"`
	}
	if err := decode(r, &req); err != nil || req.DelegationID == 0 {
		writeError(w, http.StatusBadRequest, "invalid_json", "Vyberte delegaci.")
		return
	}
	respond(w, map[string]string{"status": "ok"}, api.attendance.SetAccessCodeEnabled(r.Context(), req.DelegationID, req.Enabled))
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
	if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		current, err := api.attendance.List(r.Context())
		if err != nil {
			writeServiceError(w, err)
			return
		}
		rows, err := readAttendanceXLSX(r, current.Delegations)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_xlsx", err.Error())
			return
		}
		for _, row := range rows {
			if row.DelegationID == 0 {
				continue
			}
			if err := api.attendance.UpdateParticipant(r.Context(), row); err != nil {
				writeServiceError(w, err)
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"imported": len(rows)})
		return
	}
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
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeAttendanceXLSX(w, state, requestBaseURL(r))
}

func requestBaseURL(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	if host == "" {
		return ""
	}
	return proto + "://" + host
}
