package domain

import "time"

type Participant struct {
	ID              int64     `json:"id"`
	DelegationID    int64     `json:"delegationId"`
	Name            string    `json:"name"`
	Email           string    `json:"email"`
	CoDelegateName  string    `json:"coDelegateName"`
	CoDelegateEmail string    `json:"coDelegateEmail"`
	Note            string    `json:"note"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}
