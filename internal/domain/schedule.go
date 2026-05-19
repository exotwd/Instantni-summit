package domain

import "time"

type AgendaItem struct {
	ID           int64      `json:"id"`
	Title        string     `json:"title"`
	Type         string     `json:"type"`
	StartsAt     *time.Time `json:"startsAt,omitempty"`
	EndsAt       *time.Time `json:"endsAt,omitempty"`
	DurationMinutes *int       `json:"durationMinutes,omitempty"`
	Note         string     `json:"note"`
	DisplayOrder int        `json:"displayOrder"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}
