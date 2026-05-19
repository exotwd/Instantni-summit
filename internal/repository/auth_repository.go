package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type AuthRepository struct {
	db database.Executor
}

func NewAuthRepository(db database.Executor) *AuthRepository {
	return &AuthRepository{db: db}
}

func (r *AuthRepository) CreateToken(ctx context.Context, role, tokenHash string, expiresAt time.Time) error {
	_, err := r.db.ExecContext(ctx, `insert into auth_tokens(role, token_hash, expires_at) values(?,?,?)`, role, tokenHash, expiresAt)
	return err
}

func (r *AuthRepository) FindValidToken(ctx context.Context, role, tokenHash string, now time.Time) (*domain.AuthToken, error) {
	var token domain.AuthToken
	var revoked sql.NullTime
	err := r.db.QueryRowContext(ctx, `select id, role, token_hash, created_at, expires_at, revoked_at
		from auth_tokens where role = ? and token_hash = ? and expires_at > ? and revoked_at is null`, role, tokenHash, now).
		Scan(&token.ID, &token.Role, &token.TokenHash, &token.CreatedAt, &token.ExpiresAt, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	token.RevokedAt = nullTimePtr(revoked)
	return &token, err
}

func (r *AuthRepository) RevokeToken(ctx context.Context, tokenHash string) error {
	_, err := r.db.ExecContext(ctx, `update auth_tokens set revoked_at = current_timestamp where token_hash = ?`, tokenHash)
	return err
}
