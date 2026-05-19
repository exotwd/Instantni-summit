package realtime

const (
	EventConnected         = "connected"
	EventVotingUpdated     = "voting.updated"
	EventVotingClosed      = "voting.closed"
	EventVotingReopened    = "voting.reopened"
	EventVotingSaved       = "voting.saved"
	EventVotingCancelled   = "voting.cancelled"
	EventSpeakerUpdated    = "speaker.updated"
	EventResolutionUpdated = "resolution.updated"
	EventAttendanceUpdated = "attendance.updated"
	EventLayoutUpdated     = "layout.updated"
	EventBreakStarted      = "break.started"
	EventBreakEnded        = "break.ended"
	EventDebateUpdated     = "debate.updated"
	EventSettingsUpdated   = "settings.updated"
	EventAgendaUpdated     = "agenda.updated"
	EventResetPerformed    = "reset.performed"
)

type Event struct {
	Type     string `json:"type"`
	Revision int64  `json:"revision"`
	Payload  any    `json:"payload,omitempty"`
}
