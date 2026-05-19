package dto

type AgendaRequest struct {
	Title string `json:"title"`
	Type  string `json:"type"`
	Note  string `json:"note"`
}
