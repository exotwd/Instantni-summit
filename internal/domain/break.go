package domain

import "time"

const (
	BreakCaucus = "caucus"
	BreakCoffee = "coffee_break"
	BreakCustom = "custom_break"
	BreakActive = "active"
	BreakEnded  = "ended"
)

type Break struct {
	ID        int64      `json:"id"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
	EndsAt    *time.Time `json:"endsAt,omitempty"`
	Status    string     `json:"status"`
	Revision  int64      `json:"revision"`
}
