package realtime

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

func NewHub() *Hub {
	return &Hub{clients: map[string]*Client{}}
}

func (h *Hub) Subscribe(role string) *Client {
	client := &Client{ID: randomID(), Role: role, ch: make(chan Event, 32)}
	h.mu.Lock()
	h.clients[client.ID] = client
	h.mu.Unlock()
	return client
}

func (h *Hub) Unsubscribe(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client.ID]; ok {
		delete(h.clients, client.ID)
		close(client.ch)
	}
	h.mu.Unlock()
}

func (h *Hub) Publish(event Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, client := range h.clients {
		if !roleCanReceive(client.Role, event.Type) {
			continue
		}
		select {
		case client.ch <- event:
		default:
		}
	}
}

func roleCanReceive(role, eventType string) bool {
	switch role {
	case "admin":
		return true
	case "screen":
		return eventType != EventAgendaUpdated && eventType != EventAttendanceUpdated && eventType != EventSettingsUpdated
	case "delegate":
		return eventType == EventVotingUpdated || eventType == EventVotingClosed ||
			eventType == EventVotingReopened || eventType == EventVotingCancelled ||
			eventType == EventResolutionUpdated || eventType == EventResetPerformed
	default:
		return false
	}
}

func randomID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "client"
	}
	return hex.EncodeToString(buf)
}
