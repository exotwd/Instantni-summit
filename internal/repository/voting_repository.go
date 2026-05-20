package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type VotingRepository struct {
	db database.Executor
}

func NewVotingRepository(db database.Executor) *VotingRepository {
	return &VotingRepository{db: db}
}

func (r *VotingRepository) Start(ctx context.Context, amendmentID *int64, timeLimitSec int, revision int64) (int64, error) {
	if _, err := r.db.ExecContext(ctx, `update voting_sessions set status='cancelled', updated_at=current_timestamp where status in ('open','closed')`); err != nil {
		return 0, err
	}
	res, err := r.db.ExecContext(ctx, `insert into voting_sessions(amendment_id,status,started_at,time_limit_sec,revision) values(?,?,?,?,?)`,
		amendmentID, domain.VotingOpen, time.Now().UTC(), timeLimitSec, revision)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *VotingRepository) Current(ctx context.Context) (*domain.VotingSession, error) {
	row := r.db.QueryRowContext(ctx, `select id, amendment_id, status, started_at, closed_at, time_limit_sec, revision, created_at, updated_at
		from voting_sessions where status in ('open','closed','saved') order by id desc limit 1`)
	session, err := scanVotingSession(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	addSecondsLeft(&session)
	return &session, nil
}

func (r *VotingRepository) Get(ctx context.Context, id int64) (*domain.VotingSession, error) {
	row := r.db.QueryRowContext(ctx, `select id, amendment_id, status, started_at, closed_at, time_limit_sec, revision, created_at, updated_at
		from voting_sessions where id=?`, id)
	session, err := scanVotingSession(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	addSecondsLeft(&session)
	return &session, nil
}

func (r *VotingRepository) SetStatus(ctx context.Context, id int64, status string, revision int64) error {
	switch status {
	case domain.VotingClosed:
		_, err := r.db.ExecContext(ctx, `update voting_sessions set status=?, closed_at=current_timestamp, revision=?, updated_at=current_timestamp where id=?`, status, revision, id)
		return err
	case domain.VotingOpen:
		_, err := r.db.ExecContext(ctx, `update voting_sessions set status=?, started_at=current_timestamp, closed_at=null, revision=?, updated_at=current_timestamp where id=?`, status, revision, id)
		return err
	default:
		_, err := r.db.ExecContext(ctx, `update voting_sessions set status=?, revision=?, updated_at=current_timestamp where id=?`, status, revision, id)
		return err
	}
}

func (r *VotingRepository) Cast(ctx context.Context, sessionID, delegationID int64, choice, source string, revision int64) error {
	if _, err := r.db.ExecContext(ctx, `insert into votes(voting_session_id, delegation_id, choice, source)
		values(?,?,?,?)
		on conflict(voting_session_id, delegation_id) do update set choice=excluded.choice, source=excluded.source, updated_at=current_timestamp`,
		sessionID, delegationID, choice, source); err != nil {
		return err
	}
	_, err := r.db.ExecContext(ctx, `update voting_sessions set revision=?, updated_at=current_timestamp where id=?`, revision, sessionID)
	return err
}

func (r *VotingRepository) Votes(ctx context.Context, sessionID int64) ([]domain.Vote, error) {
	rows, err := r.db.QueryContext(ctx, `select id, voting_session_id, delegation_id, choice, source, created_at, updated_at from votes where voting_session_id=? order by updated_at, id`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Vote
	for rows.Next() {
		var v domain.Vote
		if err := rows.Scan(&v.ID, &v.VotingSessionID, &v.DelegationID, &v.Choice, &v.Source, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (r *VotingRepository) ExpiredOpen(ctx context.Context, now time.Time) ([]domain.VotingSession, error) {
	rows, err := r.db.QueryContext(ctx, `select id, amendment_id, status, started_at, closed_at, time_limit_sec, revision, created_at, updated_at
		from voting_sessions where status='open' and started_at is not null`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.VotingSession
	for rows.Next() {
		session, err := scanVotingSession(rows)
		if err != nil {
			return nil, err
		}
		if session.StartedAt != nil && session.StartedAt.Add(time.Duration(session.TimeLimitSec)*time.Second).Before(now) {
			out = append(out, session)
		}
	}
	return out, rows.Err()
}

func scanVotingSession(row interface{ Scan(dest ...any) error }) (domain.VotingSession, error) {
	var session domain.VotingSession
	var amendment sql.NullInt64
	var started, closed sql.NullTime
	err := row.Scan(&session.ID, &amendment, &session.Status, &started, &closed, &session.TimeLimitSec, &session.Revision, &session.CreatedAt, &session.UpdatedAt)
	session.AmendmentID = nullInt64Ptr(amendment)
	session.StartedAt = nullTimePtr(started)
	session.ClosedAt = nullTimePtr(closed)
	return session, err
}

func addSecondsLeft(session *domain.VotingSession) {
	if session.StartedAt == nil || session.Status != domain.VotingOpen {
		session.SecondsLeft = 0
		return
	}
	ends := session.StartedAt.Add(time.Duration(session.TimeLimitSec) * time.Second)
	left := int(time.Until(ends).Seconds())
	if left < 0 {
		left = 0
	}
	session.SecondsLeft = left
}
