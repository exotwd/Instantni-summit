package repository

import (
	"context"
	"database/sql"
	"errors"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type AgendaRepository struct {
	db database.Executor
}

func NewAgendaRepository(db database.Executor) *AgendaRepository {
	return &AgendaRepository{db: db}
}

func (r *AgendaRepository) List(ctx context.Context) ([]domain.AgendaItem, error) {
	rows, err := r.db.QueryContext(ctx, `select id,title,type,starts_at,ends_at,note,display_order,created_at,updated_at from agenda_items order by display_order, starts_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.AgendaItem
	for rows.Next() {
		item, err := scanAgendaItem(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *AgendaRepository) Get(ctx context.Context, id int64) (*domain.AgendaItem, error) {
	item, err := scanAgendaItem(r.db.QueryRowContext(ctx, `select id,title,type,starts_at,ends_at,note,display_order,created_at,updated_at from agenda_items where id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &item, err
}

func (r *AgendaRepository) Create(ctx context.Context, item domain.AgendaItem) (int64, error) {
	if item.DisplayOrder == 0 {
		_ = r.db.QueryRowContext(ctx, `select coalesce(max(display_order),0)+1 from agenda_items`).Scan(&item.DisplayOrder)
	}
	res, err := r.db.ExecContext(ctx, `insert into agenda_items(title,type,starts_at,ends_at,note,display_order) values(?,?,?,?,?,?)`,
		item.Title, item.Type, item.StartsAt, item.EndsAt, item.Note, item.DisplayOrder)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *AgendaRepository) Update(ctx context.Context, item domain.AgendaItem) error {
	_, err := r.db.ExecContext(ctx, `update agenda_items set title=?, type=?, starts_at=?, ends_at=?, note=?, display_order=?, updated_at=current_timestamp where id=?`,
		item.Title, item.Type, item.StartsAt, item.EndsAt, item.Note, item.DisplayOrder, item.ID)
	return err
}

func (r *AgendaRepository) Delete(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `delete from agenda_items where id=?`, id)
	return err
}

func (r *AgendaRepository) Reorder(ctx context.Context, ids []int64) error {
	for i, id := range ids {
		if _, err := r.db.ExecContext(ctx, `update agenda_items set display_order=?, updated_at=current_timestamp where id=?`, i+1, id); err != nil {
			return err
		}
	}
	return nil
}

func scanAgendaItem(row interface{ Scan(dest ...any) error }) (domain.AgendaItem, error) {
	var item domain.AgendaItem
	var starts, ends sql.NullTime
	var note sql.NullString
	err := row.Scan(&item.ID, &item.Title, &item.Type, &starts, &ends, &note, &item.DisplayOrder, &item.CreatedAt, &item.UpdatedAt)
	item.StartsAt = nullTimePtr(starts)
	item.EndsAt = nullTimePtr(ends)
	item.Note = nullString(note)
	return item, err
}
