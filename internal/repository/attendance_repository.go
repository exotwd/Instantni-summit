package repository

import (
	"context"

	"mun-app/internal/database"
	"mun-app/internal/domain"
)

type AttendanceRepository struct {
	db database.Executor
}

func NewAttendanceRepository(db database.Executor) *AttendanceRepository {
	return &AttendanceRepository{db: db}
}

func (r *AttendanceRepository) InsertRecord(ctx context.Context, record domain.AttendanceRecord) error {
	_, err := r.db.ExecContext(ctx, `insert into attendance_records(delegation_id, participant_id, present, access_code, checked_by, note)
		values(?,?,?,?,?,?)`, record.DelegationID, record.ParticipantID, record.Present, record.AccessCode, record.CheckedBy, record.Note)
	return err
}
