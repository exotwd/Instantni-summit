package domain

import "time"

const (
	VoteFor     = "for"
	VoteAgainst = "against"
	VoteAbstain = "abstain"
	VoteAbsent  = "absent"

	SourceAdmin    = "admin"
	SourceDelegate = "delegate"

	VotingOpen      = "open"
	VotingClosed    = "closed"
	VotingSaved     = "saved"
	VotingCancelled = "cancelled"
)

type VotingSession struct {
	ID           int64      `json:"id"`
	AmendmentID  *int64     `json:"amendmentId,omitempty"`
	Status       string     `json:"status"`
	StartedAt    *time.Time `json:"startedAt,omitempty"`
	ClosedAt     *time.Time `json:"closedAt,omitempty"`
	TimeLimitSec int        `json:"timeLimitSec"`
	Revision     int64      `json:"revision"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	SecondsLeft  int        `json:"secondsLeft"`
}

type Vote struct {
	ID              int64     `json:"id"`
	VotingSessionID int64     `json:"votingSessionId"`
	DelegationID     int64     `json:"delegationId"`
	Choice           string    `json:"choice"`
	Source           string    `json:"source"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type VoteCounts struct {
	For     int `json:"for"`
	Against int `json:"against"`
	Abstain int `json:"abstain"`
	Absent  int `json:"absent"`
}

type VotingState struct {
	Revision    int64              `json:"revision"`
	Session     *VotingSession     `json:"session,omitempty"`
	Amendment   *Amendment         `json:"amendment,omitempty"`
	Votes       []Vote             `json:"votes"`
	Counts      VoteCounts         `json:"counts"`
	CurrentVote string             `json:"currentVote,omitempty"`
	Resolution  ResolutionSnapshot `json:"resolution"`
}
