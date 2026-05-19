package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type AmendmentRepository struct {
	db database.Executor
}

func NewAmendmentRepository(db database.Executor) *AmendmentRepository {
	return &AmendmentRepository{db: db}
}

func (r *AmendmentRepository) List(ctx context.Context) ([]domain.Amendment, error) {
	rows, err := r.db.QueryContext(ctx, `select id, number, type, target_point_id, submitter_delegation_id, submitter_name, guarantors_text, text, status, introduced_at, created_at, updated_at
		from amendments order by number desc, id desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Amendment
	for rows.Next() {
		item, err := scanAmendment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *AmendmentRepository) Get(ctx context.Context, id int64) (*domain.Amendment, error) {
	row := r.db.QueryRowContext(ctx, `select id, number, type, target_point_id, submitter_delegation_id, submitter_name, guarantors_text, text, status, introduced_at, created_at, updated_at
		from amendments where id = ?`, id)
	item, err := scanAmendment(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *AmendmentRepository) Create(ctx context.Context, a domain.Amendment) (int64, error) {
	number := a.Number
	if number == 0 {
		var err error
		number, err = r.NextNumber(ctx)
		if err != nil {
			return 0, err
		}
	}
	res, err := r.db.ExecContext(ctx, `insert into amendments(number,type,target_point_id,submitter_delegation_id,submitter_name,guarantors_text,text,status)
		values(?,?,?,?,?,?,?,?)`, number, a.Type, a.TargetPointID, a.SubmitterDelegationID, a.SubmitterName, a.GuarantorsText, a.Text, a.Status)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *AmendmentRepository) Update(ctx context.Context, a domain.Amendment) error {
	_, err := r.db.ExecContext(ctx, `update amendments set type=?, target_point_id=?, submitter_delegation_id=?, submitter_name=?, guarantors_text=?, text=?, status=?, updated_at=current_timestamp where id=?`,
		a.Type, a.TargetPointID, a.SubmitterDelegationID, a.SubmitterName, a.GuarantorsText, a.Text, a.Status, a.ID)
	return err
}

func (r *AmendmentRepository) SetStatus(ctx context.Context, id int64, status string) error {
	if status == domain.AmendmentIntroduced {
		_, err := r.db.ExecContext(ctx, `update amendments set status=?, introduced_at=current_timestamp, updated_at=current_timestamp where id=?`, status, id)
		return err
	}
	_, err := r.db.ExecContext(ctx, `update amendments set status=?, updated_at=current_timestamp where id=?`, status, id)
	return err
}

func (r *AmendmentRepository) NextNumber(ctx context.Context) (int, error) {
	var next int
	err := r.db.QueryRowContext(ctx, `select coalesce(max(number),0)+1 from amendments`).Scan(&next)
	return next, err
}

func (r *AmendmentRepository) StartDebate(ctx context.Context, amendment domain.Amendment, revision int64) (int64, error) {
	_, _ = r.db.ExecContext(ctx, `delete from debate_sessions`)
	res, err := r.db.ExecContext(ctx, `insert into debate_sessions(amendment_id, submitter_delegation_id, phase, phase_started_at, revision)
		values(?,?,?,?,?)`, amendment.ID, amendment.SubmitterDelegationID, "submitter_reading", time.Now().UTC(), revision)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func scanAmendment(row interface{ Scan(dest ...any) error }) (domain.Amendment, error) {
	var item domain.Amendment
	var target, submitter sql.NullInt64
	var submitterName, guarantors sql.NullString
	var introduced sql.NullTime
	err := row.Scan(&item.ID, &item.Number, &item.Type, &target, &submitter, &submitterName, &guarantors, &item.Text, &item.Status, &introduced, &item.CreatedAt, &item.UpdatedAt)
	item.TargetPointID = nullInt64Ptr(target)
	item.SubmitterDelegationID = nullInt64Ptr(submitter)
	item.SubmitterName = nullString(submitterName)
	item.GuarantorsText = nullString(guarantors)
	item.IntroducedAt = nullTimePtr(introduced)
	return item, err
}
