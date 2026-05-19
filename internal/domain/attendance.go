package domain

import "time"

type AttendanceRecord struct {
	ID            int64     `json:"id"`
	DelegationID  int64     `json:"delegationId"`
	ParticipantID *int64    `json:"participantId,omitempty"`
	Present       bool      `json:"present"`
	AccessCode    string    `json:"accessCode,omitempty"`
	CheckedAt     time.Time `json:"checkedAt"`
	CheckedBy     string    `json:"checkedBy"`
	Note          string    `json:"note"`
}

type AttendanceSnapshot struct {
	Revision    int64        `json:"revision"`
	Delegations []Delegation `json:"delegations"`
}
