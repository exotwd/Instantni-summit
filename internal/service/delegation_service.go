package service

import (
	"context"
	"database/sql"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type DelegationService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewDelegationService(db *sql.DB, hub *realtime.Hub) *DelegationService {
	return &DelegationService{db: db, hub: hub}
}

func (s *DelegationService) List(ctx context.Context, includeParticipants bool) ([]domain.Delegation, error) {
	return repository.NewDelegationRepository(s.db).List(ctx, includeParticipants)
}

func (s *DelegationService) Update(ctx context.Context, d domain.Delegation) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if err := repository.NewDelegationRepository(tx).UpdateBasic(ctx, d); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "attendance")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventAttendanceUpdated, "admin", "", d)
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventAttendanceUpdated, Revision: revision, Payload: d})
	}
	return err
}

func (s *DelegationService) UpdateSeat(ctx context.Context, seat domain.SeatLayout) error {
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "layout")
		if err != nil {
			return err
		}
		if err := repository.NewDelegationRepository(tx).UpdateSeat(ctx, seat, revision); err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventLayoutUpdated, "admin", "", seat)
	})
	if err == nil {
		s.hub.Publish(realtime.Event{Type: realtime.EventLayoutUpdated, Revision: revision, Payload: seat})
	}
	return err
}
