package domain

import "time"

const (
	RoleAdmin    = "admin"
	RoleScreen   = "screen"
	RoleDelegate = "delegate"
)

type AuthToken struct {
	ID        int64      `json:"id"`
	Role      string     `json:"role"`
	TokenHash string     `json:"-"`
	CreatedAt time.Time  `json:"createdAt"`
	ExpiresAt time.Time  `json:"expiresAt"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
}
