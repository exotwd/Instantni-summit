package dto

type AmendmentRequest struct {
	Type           string `json:"type"`
	TargetPointID *int64 `json:"targetPointId,omitempty"`
	Text           string `json:"text"`
	GuarantorsText string `json:"guarantorsText"`
}
