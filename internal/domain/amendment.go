package domain

import "time"

const (
	AmendmentAdd    = "add"
	AmendmentUpdate = "update"
	AmendmentRemove = "remove"

	AmendmentSubmitted  = "submitted"
	AmendmentAccepted   = "accepted"
	AmendmentIntroduced = "introduced"
	AmendmentRejected   = "rejected"
	AmendmentPassed     = "passed"
	AmendmentFailed     = "failed"
)

type Amendment struct {
	ID                    int64      `json:"id"`
	Number                int        `json:"number"`
	Type                  string     `json:"type"`
	TargetPointID         *int64     `json:"targetPointId,omitempty"`
	SubmitterDelegationID *int64     `json:"submitterDelegationId,omitempty"`
	SubmitterName         string     `json:"submitterName"`
	GuarantorsText        string     `json:"guarantorsText"`
	Text                  string     `json:"text"`
	Status                string     `json:"status"`
	IntroducedAt          *time.Time `json:"introducedAt,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}
