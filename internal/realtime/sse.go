package realtime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func Serve(w http.ResponseWriter, r *http.Request, hub *Hub, role string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	client := hub.Subscribe(role)
	defer hub.Unsubscribe(client)

	writeEvent(w, Event{Type: EventConnected, Revision: 0, Payload: map[string]string{"role": role}})
	flusher.Flush()

	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			_, _ = fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		case event := <-client.Events():
			writeEvent(w, event)
			flusher.Flush()
		}
	}
}

func writeEvent(w http.ResponseWriter, event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "event: %s\n", event.Type)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
}
