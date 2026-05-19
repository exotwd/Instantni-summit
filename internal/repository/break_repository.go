package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type BreakRepository struct {
	db database.Executor
}

func NewBreakRepository(db database.Executor) *BreakRepository {
	return &BreakRepository{db: db}
}

func (r *BreakRepository) Start(ctx context.Context, typ, title string, endsAt time.Time, revision int64) (int64, error) {
	if _, err := r.db.ExecContext(ctx, `update breaks set status='ended' where status='active'`); err != nil {
		return 0, err
	}
	res, err := r.db.ExecContext(ctx, `insert into breaks(type,title,started_at,ends_at,status,revision) values(?,?,current_timestamp,?,?,?)`,
		typ, title, endsAt, domain.BreakActive, revision)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *BreakRepository) EndActive(ctx context.Context, revision int64) error {
	_, err := r.db.ExecContext(ctx, `update breaks set status='ended', revision=? where status='active'`, revision)
	return err
}

func (r *BreakRepository) Active(ctx context.Context) (*domain.Break, error) {
	item, err := scanBreak(r.db.QueryRowContext(ctx, `select id,type,title,started_at,ends_at,status,revision from breaks where status='active' order by id desc limit 1`))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &item, err
}

func scanBreak(row interface{ Scan(dest ...any) error }) (domain.Break, error) {
	var item domain.Break
	var started, ends sql.NullTime
	err := row.Scan(&item.ID, &item.Type, &item.Title, &started, &ends, &item.Status, &item.Revision)
	item.StartedAt = nullTimePtr(started)
	item.EndsAt = nullTimePtr(ends)
	return item, err
}
