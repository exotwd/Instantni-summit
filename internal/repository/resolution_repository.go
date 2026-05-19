package repository

import (
	"context"
	"database/sql"
	"errors"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type ResolutionRepository struct {
	db database.Executor
}

func NewResolutionRepository(db database.Executor) *ResolutionRepository {
	return &ResolutionRepository{db: db}
}

func (r *ResolutionRepository) List(ctx context.Context, includeRemoved bool) ([]domain.ResolutionPoint, error) {
	query := `select id, number, text, status, source_amendment_id, created_at, updated_at, removed_at from resolution_points`
	if !includeRemoved {
		query += ` where status = 'active'`
	}
	query += ` order by number, id`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.ResolutionPoint
	for rows.Next() {
		point, err := scanResolutionPoint(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, point)
	}
	return out, rows.Err()
}

func (r *ResolutionRepository) Get(ctx context.Context, id int64) (*domain.ResolutionPoint, error) {
	row := r.db.QueryRowContext(ctx, `select id, number, text, status, source_amendment_id, created_at, updated_at, removed_at from resolution_points where id = ?`, id)
	point, err := scanResolutionPoint(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &point, nil
}

func (r *ResolutionRepository) AddPoint(ctx context.Context, text string, sourceAmendmentID *int64) (int64, error) {
	var next int
	if err := r.db.QueryRowContext(ctx, `select coalesce(max(number), 0) + 1 from resolution_points where status = 'active'`).Scan(&next); err != nil {
		return 0, err
	}
	res, err := r.db.ExecContext(ctx, `insert into resolution_points(number,text,status,source_amendment_id) values(?,?,?,?)`, next, text, domain.ResolutionActive, sourceAmendmentID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *ResolutionRepository) UpdatePoint(ctx context.Context, id int64, text string) error {
	_, err := r.db.ExecContext(ctx, `update resolution_points set text=?, status='active', updated_at=current_timestamp where id=?`, text, id)
	return err
}

func (r *ResolutionRepository) RemovePoint(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `update resolution_points set status='removed', removed_at=current_timestamp, updated_at=current_timestamp where id=?`, id)
	return err
}

func (r *ResolutionRepository) Renumber(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `select id from resolution_points where status='active' order by number, id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := r.db.ExecContext(ctx, `update resolution_points set number=?, updated_at=current_timestamp where id=?`, i+1, id); err != nil {
			return err
		}
	}
	return nil
}

func scanResolutionPoint(row interface{ Scan(dest ...any) error }) (domain.ResolutionPoint, error) {
	var point domain.ResolutionPoint
	var source sql.NullInt64
	var removed sql.NullTime
	err := row.Scan(&point.ID, &point.Number, &point.Text, &point.Status, &source, &point.CreatedAt, &point.UpdatedAt, &removed)
	point.SourceAmendmentID = nullInt64Ptr(source)
	point.RemovedAt = nullTimePtr(removed)
	return point, err
}
