package domain

import "time"

type DebateSession struct {
	ID                    int64      `json:"id"`
	AmendmentID           *int64     `json:"amendmentId,omitempty"`
	SubmitterDelegationID *int64     `json:"submitterDelegationId,omitempty"`
	SupporterDelegationID *int64     `json:"supporterDelegationId,omitempty"`
	OpponentDelegationID  *int64     `json:"opponentDelegationId,omitempty"`
	Phase                 string     `json:"phase"`
	PhaseStartedAt        *time.Time `json:"phaseStartedAt,omitempty"`
	Revision              int64      `json:"revision"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}
