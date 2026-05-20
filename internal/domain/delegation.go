package domain

import "time"

type Delegation struct {
	ID                  int64        `json:"id"`
	Name                string       `json:"name"`
	Code                string       `json:"code"`
	Flag                string       `json:"flag"`
	AccessCode          string       `json:"accessCode,omitempty"`
	AccessCodeCreatedAt *time.Time   `json:"accessCodeCreatedAt,omitempty"`
	AccessCodeEnabled   bool         `json:"accessCodeEnabled"`
	VoteLinkToken       string       `json:"voteLinkToken,omitempty"`
	VoteLinkCreatedAt   *time.Time   `json:"voteLinkCreatedAt,omitempty"`
	Present             bool         `json:"present"`
	DisplayOrder        int          `json:"displayOrder"`
	CreatedAt           time.Time    `json:"createdAt"`
	UpdatedAt           time.Time    `json:"updatedAt"`
	Participant         *Participant `json:"participant,omitempty"`
	Seat                *SeatLayout  `json:"seat,omitempty"`
}

type PublicDelegation struct {
	ID           int64       `json:"id"`
	Name         string      `json:"name"`
	Code         string      `json:"code"`
	Flag         string      `json:"flag"`
	Present      bool        `json:"present"`
	DisplayOrder int         `json:"displayOrder"`
	Seat         *SeatLayout `json:"seat,omitempty"`
}

type SeatLayout struct {
	ID           int64     `json:"id"`
	DelegationID int64     `json:"delegationId"`
	X            float64   `json:"x"`
	Y            float64   `json:"y"`
	W            float64   `json:"w"`
	H            float64   `json:"h"`
	Rotation     float64   `json:"rotation"`
	Revision     int64     `json:"revision"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (d Delegation) Public() PublicDelegation {
	return PublicDelegation{
		ID: d.ID, Name: d.Name, Code: d.Code, Flag: d.Flag,
		Present: d.Present, DisplayOrder: d.DisplayOrder, Seat: d.Seat,
	}
}
