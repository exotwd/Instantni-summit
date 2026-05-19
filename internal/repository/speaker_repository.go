package repository

import (
	"context"
	"database/sql"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type SpeakerRepository struct {
	db database.Executor
}

func NewSpeakerRepository(db database.Executor) *SpeakerRepository {
	return &SpeakerRepository{db: db}
}

func (r *SpeakerRepository) State(ctx context.Context) (domain.SpeakerState, error) {
	var state domain.SpeakerState
	var current, active sql.NullInt64
	var started sql.NullTime
	err := r.db.QueryRowContext(ctx, `select id,current_delegation_id,active_reaction_delegation_id,current_started_at,current_paused_ms,revision,updated_at from speaker_state where id=1`).
		Scan(&state.ID, &current, &active, &started, &state.CurrentPausedMS, &state.Revision, &state.UpdatedAt)
	state.CurrentDelegationID = nullInt64Ptr(current)
	state.ActiveReactionDelegationID = nullInt64Ptr(active)
	state.CurrentStartedAt = nullTimePtr(started)
	return state, err
}

func (r *SpeakerRepository) SetState(ctx context.Context, currentID, activeReactionID *int64, revision int64) error {
	_, err := r.db.ExecContext(ctx, `update speaker_state set current_delegation_id=?, active_reaction_delegation_id=?, current_started_at=case when ? is null then null else coalesce(current_started_at, current_timestamp) end, revision=?, updated_at=current_timestamp where id=1`,
		currentID, activeReactionID, currentID, revision)
	return err
}

func (r *SpeakerRepository) BumpRevisionOnly(ctx context.Context, revision int64) error {
	_, err := r.db.ExecContext(ctx, `update speaker_state set revision=?, updated_at=current_timestamp where id=1`, revision)
	return err
}

func (r *SpeakerRepository) Queue(ctx context.Context) ([]domain.SpeakerQueueItem, error) {
	rows, err := r.db.QueryContext(ctx, `select q.id,q.delegation_id,q.position,q.created_at,
		d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from speaker_queue q join delegations d on d.id=q.delegation_id
		left join seat_layout s on s.delegation_id=d.id
		left join participants p on p.delegation_id=d.id
		order by q.position, q.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.SpeakerQueueItem
	for rows.Next() {
		var item domain.SpeakerQueueItem
		if err := rows.Scan(&item.ID, &item.DelegationID, &item.Position, &item.CreatedAt,
			&item.Delegation.ID, &item.Delegation.Name, &item.Delegation.Code, &item.Delegation.Flag, new(sql.NullString), new(sql.NullTime), &item.Delegation.Present, &item.Delegation.DisplayOrder, &item.Delegation.CreatedAt, &item.Delegation.UpdatedAt,
			new(sql.NullInt64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullInt64), new(sql.NullTime),
			new(sql.NullInt64), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullTime), new(sql.NullTime)); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *SpeakerRepository) AddQueue(ctx context.Context, delegationID int64) error {
	var pos int
	if err := r.db.QueryRowContext(ctx, `select coalesce(max(position),0)+1 from speaker_queue`).Scan(&pos); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `insert into speaker_queue(delegation_id, position) values(?,?)`, delegationID, pos)
	return err
}

func (r *SpeakerRepository) RemoveQueue(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `delete from speaker_queue where id=?`, id)
	return err
}

func (r *SpeakerRepository) FirstQueue(ctx context.Context) (*domain.SpeakerQueueItem, error) {
	rows, err := r.Queue(ctx)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return &rows[0], nil
}

func (r *SpeakerRepository) Reactions(ctx context.Context) ([]domain.SpeakerReaction, error) {
	rows, err := r.db.QueryContext(ctx, `select rr.id,rr.delegation_id,rr.position,rr.status,rr.created_at,rr.started_at,
		d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from speaker_reactions rr join delegations d on d.id=rr.delegation_id
		left join seat_layout s on s.delegation_id=d.id
		left join participants p on p.delegation_id=d.id
		where rr.status != 'finished'
		order by rr.position, rr.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.SpeakerReaction
	for rows.Next() {
		var item domain.SpeakerReaction
		var started sql.NullTime
		if err := rows.Scan(&item.ID, &item.DelegationID, &item.Position, &item.Status, &item.CreatedAt, &started,
			&item.Delegation.ID, &item.Delegation.Name, &item.Delegation.Code, &item.Delegation.Flag, new(sql.NullString), new(sql.NullTime), &item.Delegation.Present, &item.Delegation.DisplayOrder, &item.Delegation.CreatedAt, &item.Delegation.UpdatedAt,
			new(sql.NullInt64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullFloat64), new(sql.NullInt64), new(sql.NullTime),
			new(sql.NullInt64), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullString), new(sql.NullTime), new(sql.NullTime)); err != nil {
			return nil, err
		}
		item.StartedAt = nullTimePtr(started)
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *SpeakerRepository) AddReaction(ctx context.Context, delegationID int64) error {
	var pos int
	if err := r.db.QueryRowContext(ctx, `select coalesce(max(position),0)+1 from speaker_reactions where status != 'finished'`).Scan(&pos); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `insert into speaker_reactions(delegation_id, position, status) values(?,?,?)`, delegationID, pos, domain.ReactionWaiting)
	return err
}

func (r *SpeakerRepository) StartReaction(ctx context.Context, id int64) (*int64, error) {
	var delegationID int64
	if err := r.db.QueryRowContext(ctx, `select delegation_id from speaker_reactions where id=?`, id).Scan(&delegationID); err != nil {
		return nil, err
	}
	_, err := r.db.ExecContext(ctx, `update speaker_reactions set status='active', started_at=current_timestamp where id=?`, id)
	return &delegationID, err
}

func (r *SpeakerRepository) FinishActiveReaction(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `update speaker_reactions set status='finished' where status='active'`)
	return err
}

func (r *SpeakerRepository) ClearReactions(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `delete from speaker_reactions`)
	return err
}

func (r *SpeakerRepository) RemoveReaction(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `delete from speaker_reactions where id=?`, id)
	return err
}

func (r *SpeakerRepository) Clear(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, `delete from speaker_queue`); err != nil {
		return err
	}
	if _, err := r.db.ExecContext(ctx, `delete from speaker_reactions`); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `update speaker_state set current_delegation_id=null, active_reaction_delegation_id=null, current_started_at=null, current_paused_ms=0, updated_at=current_timestamp where id=1`)
	return err
}
