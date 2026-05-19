package domain

import "time"

type EventLogEntry struct {
	ID          int64     `json:"id"`
	EventType   string    `json:"eventType"`
	ActorType   string    `json:"actorType"`
	ActorID     string    `json:"actorId"`
	PayloadJSON string    `json:"payloadJson"`
	CreatedAt   time.Time `json:"createdAt"`
}
