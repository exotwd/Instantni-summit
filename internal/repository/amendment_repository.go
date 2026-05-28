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
	rows, err := r.db.QueryContext(ctx, `select a.id, a.number, a.type, a.target_point_id, a.submitter_delegation_id,
		coalesce(nullif(a.submitter_name, ''), d.name, ''), a.guarantors_text, a.text, a.status, a.introduced_at, a.created_at, a.updated_at
		from amendments a
		left join delegations d on d.id = a.submitter_delegation_id
		order by a.number desc, a.id desc`)
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
	row := r.db.QueryRowContext(ctx, `select a.id, a.number, a.type, a.target_point_id, a.submitter_delegation_id,
		coalesce(nullif(a.submitter_name, ''), d.name, ''), a.guarantors_text, a.text, a.status, a.introduced_at, a.created_at, a.updated_at
		from amendments a
		left join delegations d on d.id = a.submitter_delegation_id
		where a.id = ?`, id)
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
		values(?,?,?,?,?)`, amendment.ID, amendment.SubmitterDelegationID, domain.DebateSubmitterReading, time.Now().UTC(), revision)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *AmendmentRepository) CurrentDebate(ctx context.Context) (*domain.DebateSession, error) {
	row := r.db.QueryRowContext(ctx, `select id, amendment_id, submitter_delegation_id, supporter_delegation_id, opponent_delegation_id, phase, phase_started_at, revision, created_at, updated_at
		from debate_sessions order by id desc limit 1`)
	session, err := scanDebateSession(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *AmendmentRepository) UpdateDebate(ctx context.Context, session domain.DebateSession, revision int64) error {
	_, err := r.db.ExecContext(ctx, `update debate_sessions set supporter_delegation_id=?, opponent_delegation_id=?, phase=?, phase_started_at=?, revision=?, updated_at=current_timestamp where id=?`,
		session.SupporterDelegationID, session.OpponentDelegationID, session.Phase, time.Now().UTC(), revision, session.ID)
	return err
}

func (r *AmendmentRepository) ClearDebate(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `delete from debate_sessions`)
	return err
}

func scanDebateSession(row interface{ Scan(dest ...any) error }) (domain.DebateSession, error) {
	var session domain.DebateSession
	var amendment, submitter, supporter, opponent sql.NullInt64
	var phaseStarted sql.NullTime
	err := row.Scan(&session.ID, &amendment, &submitter, &supporter, &opponent, &session.Phase, &phaseStarted, &session.Revision, &session.CreatedAt, &session.UpdatedAt)
	session.AmendmentID = nullInt64Ptr(amendment)
	session.SubmitterDelegationID = nullInt64Ptr(submitter)
	session.SupporterDelegationID = nullInt64Ptr(supporter)
	session.OpponentDelegationID = nullInt64Ptr(opponent)
	session.PhaseStartedAt = nullTimePtr(phaseStarted)
	return session, err
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
