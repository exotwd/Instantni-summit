package repository

import (
	"context"
	"database/sql"
	"errors"

	"mun-app/internal/database"
)

type SettingsRepository struct {
	db database.Executor
}

func NewSettingsRepository(db database.Executor) *SettingsRepository {
	return &SettingsRepository{db: db}
}

func (r *SettingsRepository) GetAll(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `select key, value from settings order by key`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		out[key] = value
	}
	return out, rows.Err()
}

func (r *SettingsRepository) Get(ctx context.Context, key string) (string, bool, error) {
	var value string
	err := r.db.QueryRowContext(ctx, `select value from settings where key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return value, err == nil, err
}

func (r *SettingsRepository) Set(ctx context.Context, key, value string) error {
	_, err := r.db.ExecContext(ctx, `insert into settings(key,value,updated_at) values(?,?,current_timestamp)
		on conflict(key) do update set value=excluded.value, updated_at=current_timestamp`, key, value)
	return err
}

func (r *SettingsRepository) SetMany(ctx context.Context, values map[string]string) error {
	for key, value := range values {
		if err := r.Set(ctx, key, value); err != nil {
			return err
		}
	}
	return nil
}

func (r *SettingsRepository) ResetLive(ctx context.Context) error {
	statements := []string{
		`update voting_sessions set status='cancelled', updated_at=current_timestamp where status in ('open','closed','preparing')`,
		`delete from speaker_queue`,
		`delete from speaker_reactions`,
		`update speaker_state set current_delegation_id=null, active_reaction_delegation_id=null, current_started_at=null, current_paused_ms=0, revision=revision+1, updated_at=current_timestamp where id=1`,
		`update breaks set status='ended' where status='active'`,
		`delete from debate_sessions`,
	}
	for _, statement := range statements {
		if _, err := r.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

func (r *SettingsRepository) ResetAll(ctx context.Context) error {
	statements := []string{
		`delete from votes`,
		`delete from voting_sessions`,
		`delete from speaker_queue`,
		`delete from speaker_reactions`,
		`update speaker_state set current_delegation_id=null, active_reaction_delegation_id=null, current_started_at=null, current_paused_ms=0`,
		`delete from debate_sessions`,
		`delete from breaks`,
		`delete from amendment_guarantors`,
		`update amendments set target_point_id=null`,
		`update resolution_points set source_amendment_id=null`,
		`delete from resolution_points`,
		`delete from amendments`,
		`delete from attendance_records`,
		`delete from participants`,
		`delete from seat_layout`,
		`delete from delegations`,
		`delete from agenda_items`,
		`delete from event_log`,
		`update state_revisions set revision=revision+1, updated_at=current_timestamp`,
	}
	for _, statement := range statements {
		if _, err := r.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if err := NewResolutionRepository(r.db).ResetDefaultTemplate(ctx); err != nil {
		return err
	}
	return nil
}

func (r *SettingsRepository) DeleteStoredData(ctx context.Context, scope string) error {
	statementsByScope := map[string][]string{
		"attendance": {
			`delete from attendance_records`,
			`delete from participants`,
			`update delegations set present=false, access_code=null, access_code_created_at=null, access_code_enabled=false, vote_link_token=null, vote_link_created_at=null, updated_at=current_timestamp`,
		},
		"agenda": {
			`delete from agenda_items`,
		},
		"amendments": {
			`delete from votes`,
			`delete from voting_sessions`,
			`delete from debate_sessions`,
			`delete from amendment_guarantors`,
			`update amendments set target_point_id=null, updated_at=current_timestamp`,
			`delete from resolution_points where source_amendment_id is not null`,
			`delete from amendments`,
		},
		"resolution": {
			`update amendments set target_point_id=null, updated_at=current_timestamp`,
			`update resolution_points set source_amendment_id=null, updated_at=current_timestamp`,
			`delete from resolution_points`,
		},
		"voting": {
			`delete from votes`,
			`delete from voting_sessions`,
			`delete from debate_sessions`,
		},
		"speakers": {
			`delete from speaker_queue`,
			`delete from speaker_reactions`,
			`update speaker_state set current_delegation_id=null, active_reaction_delegation_id=null, current_started_at=null, current_paused_ms=0, revision=revision+1, updated_at=current_timestamp where id=1`,
		},
		"breaks": {
			`delete from breaks`,
		},
		"work-data": {
			`delete from votes`,
			`delete from voting_sessions`,
			`delete from speaker_queue`,
			`delete from speaker_reactions`,
			`update speaker_state set current_delegation_id=null, active_reaction_delegation_id=null, current_started_at=null, current_paused_ms=0, revision=revision+1, updated_at=current_timestamp where id=1`,
			`delete from debate_sessions`,
			`delete from breaks`,
			`delete from amendment_guarantors`,
			`update amendments set target_point_id=null, updated_at=current_timestamp`,
			`update resolution_points set source_amendment_id=null, updated_at=current_timestamp`,
			`delete from resolution_points`,
			`delete from amendments`,
			`delete from attendance_records`,
			`delete from participants`,
			`update delegations set present=false, access_code=null, access_code_created_at=null, access_code_enabled=false, vote_link_token=null, vote_link_created_at=null, updated_at=current_timestamp`,
			`delete from agenda_items`,
		},
	}
	statements, ok := statementsByScope[scope]
	if !ok {
		return sql.ErrNoRows
	}
	for _, statement := range statements {
		if _, err := r.db.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if scope == "amendments" || scope == "resolution" || scope == "work-data" {
		if err := NewResolutionRepository(r.db).ResetDefaultTemplate(ctx); err != nil {
			return err
		}
	}
	return nil
}
