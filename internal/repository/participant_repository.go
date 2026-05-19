package repository

import (
	"context"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type ParticipantRepository struct {
	db database.Executor
}

func NewParticipantRepository(db database.Executor) *ParticipantRepository {
	return &ParticipantRepository{db: db}
}

func (r *ParticipantRepository) UpsertForDelegation(ctx context.Context, p domain.Participant) (int64, error) {
	_, err := r.db.ExecContext(ctx, `insert into participants(delegation_id,name,email,co_delegate_name,co_delegate_email,note)
		values(?,?,?,?,?,?)
		on conflict(delegation_id) do update set name=excluded.name,email=excluded.email,co_delegate_name=excluded.co_delegate_name,
		co_delegate_email=excluded.co_delegate_email,note=excluded.note,updated_at=current_timestamp`,
		p.DelegationID, p.Name, p.Email, p.CoDelegateName, p.CoDelegateEmail, p.Note)
	if err != nil {
		return 0, err
	}
	var id int64
	err = r.db.QueryRowContext(ctx, `select id from participants where delegation_id = ?`, p.DelegationID).Scan(&id)
	return id, err
}
