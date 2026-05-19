package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"mun-app/internal/database"
)

type EventRepository struct {
	db database.Executor
}

func NewEventRepository(db database.Executor) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) Log(ctx context.Context, eventType, actorType, actorID string, payload any) error {
	var encoded []byte
	var err error
	if payload != nil {
		encoded, err = json.Marshal(payload)
		if err != nil {
			return err
		}
	}
	_, err = r.db.ExecContext(ctx, `insert into event_log(event_type, actor_type, actor_id, payload_json) values (?,?,?,?)`,
		eventType, actorType, actorID, string(encoded))
	return err
}

func (r *EventRepository) BumpRevision(ctx context.Context, name string) (int64, error) {
	if _, err := r.db.ExecContext(ctx, `insert into state_revisions(name, revision) values (?, 1)
		on conflict(name) do update set revision = revision + 1, updated_at = current_timestamp`, name); err != nil {
		return 0, err
	}
	return r.Revision(ctx, name)
}

func (r *EventRepository) Revision(ctx context.Context, name string) (int64, error) {
	var revision int64
	err := r.db.QueryRowContext(ctx, `select revision from state_revisions where name = ?`, name).Scan(&revision)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return revision, err
}

func nullString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func nullInt64Ptr(value sql.NullInt64) *int64 {
	if value.Valid {
		v := value.Int64
		return &v
	}
	return nil
}

func nullTimePtr(value sql.NullTime) *time.Time {
	if value.Valid {
		v := value.Time
		return &v
	}
	return nil
}
