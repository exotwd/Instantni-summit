package domain

import "time"

const (
	ReactionWaiting  = "waiting"
	ReactionActive   = "active"
	ReactionFinished = "finished"
)

type SpeakerState struct {
	ID                         int64      `json:"id"`
	CurrentDelegationID        *int64     `json:"currentDelegationId,omitempty"`
	ActiveReactionDelegationID *int64     `json:"activeReactionDelegationId,omitempty"`
	CurrentStartedAt           *time.Time `json:"currentStartedAt,omitempty"`
	CurrentPausedMS            int64      `json:"currentPausedMs"`
	Revision                   int64      `json:"revision"`
	UpdatedAt                  time.Time  `json:"updatedAt"`
}

type SpeakerQueueItem struct {
	ID           int64      `json:"id"`
	DelegationID int64      `json:"delegationId"`
	Delegation   Delegation `json:"delegation"`
	Position     int        `json:"position"`
	CreatedAt    time.Time  `json:"createdAt"`
}

type SpeakerReaction struct {
	ID           int64      `json:"id"`
	DelegationID int64      `json:"delegationId"`
	Delegation   Delegation `json:"delegation"`
	Position     int        `json:"position"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"createdAt"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
}

type SpeakerSnapshot struct {
	Revision       int64              `json:"revision"`
	State          SpeakerState       `json:"state"`
	CurrentSpeaker *Delegation        `json:"currentSpeaker,omitempty"`
	ActiveReaction *Delegation        `json:"activeReaction,omitempty"`
	Queue          []SpeakerQueueItem `json:"queue"`
	Reactions      []SpeakerReaction  `json:"reactions"`
}
