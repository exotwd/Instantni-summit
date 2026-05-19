package dto

type LoginRequest struct {
	PIN string `json:"pin"`
}

type MeResponse struct {
	Role         string `json:"role"`
	DelegationID int64  `json:"delegationId,omitempty"`
}
