package domain

import "time"

const (
	DebateSubmitterReading = "submitter_reading"
	DebateSelectSupporter  = "select_supporter"
	DebateSelectOpponent   = "select_opponent"
	DebateSupporterSpeaking = "supporter_speaking"
	DebateOpponentSpeaking  = "opponent_speaking"
	DebateReadyToVote      = "ready_to_vote"
)

type DebateSession struct {
	ID                    int64      `json:"id"`
	AmendmentID           *int64     `json:"amendmentId,omitempty"`
	SubmitterDelegationID *int64     `json:"submitterDelegationId,omitempty"`
	SupporterDelegationID *int64     `json:"supporterDelegationId,omitempty"`
	OpponentDelegationID  *int64     `json:"opponentDelegationId,omitempty"`
	Phase                 string     `json:"phase"`
	PhaseStartedAt        *time.Time `json:"phaseStartedAt,omitempty"`
	Revision              int64      `json:"revision"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

type DebateState struct {
	Session   *DebateSession    `json:"session,omitempty"`
	Amendment *Amendment        `json:"amendment,omitempty"`
	Submitter *PublicDelegation `json:"submitter,omitempty"`
	Supporter *PublicDelegation `json:"supporter,omitempty"`
	Opponent  *PublicDelegation `json:"opponent,omitempty"`
}
