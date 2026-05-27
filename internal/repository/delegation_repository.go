package repository

import (
	"context"
	"database/sql"
	"errors"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type DelegationRepository struct {
	db database.Executor
}

func NewDelegationRepository(db database.Executor) *DelegationRepository {
	return &DelegationRepository{db: db}
}

func (r *DelegationRepository) List(ctx context.Context, includeParticipants bool) ([]domain.Delegation, error) {
	rows, err := r.db.QueryContext(ctx, `select d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.access_code_enabled,d.vote_link_token,d.vote_link_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from delegations d
		left join seat_layout s on s.delegation_id = d.id
		left join participants p on p.delegation_id = d.id
		order by d.display_order, d.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Delegation
	for rows.Next() {
		d, err := scanDelegation(rows, includeParticipants)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *DelegationRepository) Get(ctx context.Context, id int64, includeParticipant bool) (*domain.Delegation, error) {
	row := r.db.QueryRowContext(ctx, `select d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.access_code_enabled,d.vote_link_token,d.vote_link_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from delegations d
		left join seat_layout s on s.delegation_id = d.id
		left join participants p on p.delegation_id = d.id
		where d.id = ?`, id)
	d, err := scanDelegation(row, includeParticipant)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DelegationRepository) FindByAccessCode(ctx context.Context, code string) (*domain.Delegation, error) {
	row := r.db.QueryRowContext(ctx, `select d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.access_code_enabled,d.vote_link_token,d.vote_link_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from delegations d
		left join seat_layout s on s.delegation_id = d.id
		left join participants p on p.delegation_id = d.id
		where d.access_code = ? and d.access_code_enabled = true`, code)
	d, err := scanDelegation(row, false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DelegationRepository) FindByVoteLinkToken(ctx context.Context, token string) (*domain.Delegation, error) {
	row := r.db.QueryRowContext(ctx, `select d.id,d.name,d.code,d.flag,d.access_code,d.access_code_created_at,d.access_code_enabled,d.vote_link_token,d.vote_link_created_at,d.present,d.display_order,d.created_at,d.updated_at,
		s.id,s.x,s.y,s.w,s.h,s.rotation,s.revision,s.updated_at,
		p.id,p.name,p.email,p.co_delegate_name,p.co_delegate_email,p.note,p.created_at,p.updated_at
		from delegations d
		left join seat_layout s on s.delegation_id = d.id
		left join participants p on p.delegation_id = d.id
		where d.vote_link_token = ?`, token)
	d, err := scanDelegation(row, false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (r *DelegationRepository) UpdateBasic(ctx context.Context, d domain.Delegation) error {
	_, err := r.db.ExecContext(ctx, `update delegations set name=?, code=?, flag=?, access_code_enabled=?, display_order=?, updated_at=current_timestamp where id=?`,
		d.Name, d.Code, d.Flag, d.AccessCodeEnabled, d.DisplayOrder, d.ID)
	return err
}

func (r *DelegationRepository) SetPresence(ctx context.Context, id int64, present bool) error {
	_, err := r.db.ExecContext(ctx, `update delegations set present=?, updated_at=current_timestamp where id=?`, present, id)
	return err
}

func (r *DelegationRepository) SetAccessCode(ctx context.Context, id int64, code string) error {
	_, err := r.db.ExecContext(ctx, `update delegations set access_code=?, access_code_created_at=current_timestamp, updated_at=current_timestamp where id=?`, code, id)
	return err
}

func (r *DelegationRepository) SetAccessCodeEnabled(ctx context.Context, id int64, enabled bool) error {
	_, err := r.db.ExecContext(ctx, `update delegations set access_code_enabled=?, updated_at=current_timestamp where id=?`, enabled, id)
	return err
}

func (r *DelegationRepository) SetVoteLinkToken(ctx context.Context, id int64, token string) error {
	_, err := r.db.ExecContext(ctx, `update delegations set vote_link_token=?, vote_link_created_at=current_timestamp, updated_at=current_timestamp where id=?`, token, id)
	return err
}

func (r *DelegationRepository) AccessCodeExists(ctx context.Context, code string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `select count(*) from delegations where access_code = ?`, code).Scan(&count)
	return count > 0, err
}

func (r *DelegationRepository) VoteLinkTokenExists(ctx context.Context, token string) (bool, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `select count(*) from delegations where vote_link_token = ?`, token).Scan(&count)
	return count > 0, err
}

func (r *DelegationRepository) UpdateSeat(ctx context.Context, seat domain.SeatLayout, revision int64) error {
	_, err := r.db.ExecContext(ctx, `insert into seat_layout(delegation_id,x,y,w,h,rotation,revision,updated_at)
		values(?,?,?,?,?,?,?,current_timestamp)
		on conflict(delegation_id) do update set x=excluded.x,y=excluded.y,w=excluded.w,h=excluded.h,rotation=excluded.rotation,revision=excluded.revision,updated_at=current_timestamp`,
		seat.DelegationID, seat.X, seat.Y, seat.W, seat.H, seat.Rotation, revision)
	return err
}

func (r *DelegationRepository) EnsureSpeakerState(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `insert into speaker_state(id, revision) values(1,1) on conflict(id) do nothing`)
	return err
}

func (r *DelegationRepository) DeleteAll(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `delete from delegations`)
	return err
}

func (r *DelegationRepository) SeedDefaultEU(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `insert into delegations(name, code, flag, display_order) values
('Rakousko','AT','🇦🇹',1),('Belgie','BE','🇧🇪',2),('Bulharsko','BG','🇧🇬',3),
('Chorvatsko','HR','🇭🇷',4),('Kypr','CY','🇨🇾',5),('Česko','CZ','🇨🇿',6),
('Dánsko','DK','🇩🇰',7),('Estonsko','EE','🇪🇪',8),('Finsko','FI','🇫🇮',9),
('Francie','FR','🇫🇷',10),('Německo','DE','🇩🇪',11),('Řecko','GR','🇬🇷',12),
('Maďarsko','HU','🇭🇺',13),('Irsko','IE','🇮🇪',14),('Itálie','IT','🇮🇹',15),
('Lotyšsko','LV','🇱🇻',16),('Litva','LT','🇱🇹',17),('Lucembursko','LU','🇱🇺',18),
('Malta','MT','🇲🇹',19),('Nizozemsko','NL','🇳🇱',20),('Polsko','PL','🇵🇱',21),
('Portugalsko','PT','🇵🇹',22),('Rumunsko','RO','🇷🇴',23),('Slovensko','SK','🇸🇰',24),
('Slovinsko','SI','🇸🇮',25),('Španělsko','ES','🇪🇸',26),('Švédsko','SE','🇸🇪',27)`)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, `insert into seat_layout(delegation_id, x, y, w, h, rotation)
select id, 4 + ((display_order - 1) % 7) * 13, 8 + cast((display_order - 1) / 7 as integer) * 16, 10, 10, 0 from delegations`)
	return err
}

type delegationScanner interface {
	Scan(dest ...any) error
}

func scanDelegation(row delegationScanner, includeParticipant bool) (domain.Delegation, error) {
	var d domain.Delegation
	var access sql.NullString
	var accessCreated sql.NullTime
	var voteLink sql.NullString
	var voteLinkCreated sql.NullTime
	var seatID sql.NullInt64
	var sx, sy, sw, sh, rotation sql.NullFloat64
	var seatRevision sql.NullInt64
	var seatUpdated sql.NullTime
	var participantID sql.NullInt64
	var participantName, participantEmail, coName, coEmail, note sql.NullString
	var participantCreated, participantUpdated sql.NullTime
	err := row.Scan(&d.ID, &d.Name, &d.Code, &d.Flag, &access, &accessCreated, &d.AccessCodeEnabled, &voteLink, &voteLinkCreated, &d.Present, &d.DisplayOrder, &d.CreatedAt, &d.UpdatedAt,
		&seatID, &sx, &sy, &sw, &sh, &rotation, &seatRevision, &seatUpdated,
		&participantID, &participantName, &participantEmail, &coName, &coEmail, &note, &participantCreated, &participantUpdated)
	if err != nil {
		return d, err
	}
	d.AccessCode = nullString(access)
	d.AccessCodeCreatedAt = nullTimePtr(accessCreated)
	d.VoteLinkToken = nullString(voteLink)
	d.VoteLinkCreatedAt = nullTimePtr(voteLinkCreated)
	if seatID.Valid {
		d.Seat = &domain.SeatLayout{
			ID: seatID.Int64, DelegationID: d.ID, X: sx.Float64, Y: sy.Float64, W: sw.Float64,
			H: sh.Float64, Rotation: rotation.Float64, Revision: seatRevision.Int64, UpdatedAt: seatUpdated.Time,
		}
	}
	if includeParticipant && participantID.Valid {
		d.Participant = &domain.Participant{
			ID: participantID.Int64, DelegationID: d.ID, Name: nullString(participantName), Email: nullString(participantEmail),
			Note: nullString(note),
			CreatedAt: participantCreated.Time, UpdatedAt: participantUpdated.Time,
		}
	}
	return d, nil
}
