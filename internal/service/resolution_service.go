package service

import (
	"context"
	"database/sql"
	"html"
	"strings"

	"mun-app/internal/database"
	"mun-app/internal/domain"
	"mun-app/internal/realtime"
	"mun-app/internal/repository"
)

type ResolutionService struct {
	db  *sql.DB
	hub *realtime.Hub
}

func NewResolutionService(db *sql.DB, hub *realtime.Hub) *ResolutionService {
	return &ResolutionService{db: db, hub: hub}
}

func (s *ResolutionService) GetCurrentResolution(ctx context.Context) (domain.ResolutionSnapshot, error) {
	points, err := repository.NewResolutionRepository(s.db).List(ctx, false)
	if err != nil {
		return domain.ResolutionSnapshot{}, err
	}
	revision, err := repository.NewEventRepository(s.db).Revision(ctx, "resolution")
	if err != nil {
		return domain.ResolutionSnapshot{}, err
	}
	return domain.ResolutionSnapshot{Revision: revision, Points: points, HTML: RenderResolutionHTML(points)}, nil
}

func RenderResolutionHTML(points []domain.ResolutionPoint) string {
	var b strings.Builder
	b.WriteString("<ol>")
	for _, point := range points {
		b.WriteString("<li>")
		b.WriteString(html.EscapeString(point.Text))
		b.WriteString("</li>")
	}
	b.WriteString("</ol>")
	return b.String()
}

func (s *ResolutionService) AddPoint(ctx context.Context, text string) error {
	if strings.TrimSpace(text) == "" {
		return NewUserError("invalid_resolution", "Text bodu nesmí být prázdný.")
	}
	var revision int64
	err := database.WithTx(ctx, s.db, func(tx *sql.Tx) error {
		if _, err := repository.NewResolutionRepository(tx).AddPoint(ctx, text, nil); err != nil {
			return err
		}
		events := repository.NewEventRepository(tx)
		var err error
		revision, err = events.BumpRevision(ctx, "resolution")
		if err != nil {
			return err
		}
		return events.Log(ctx, realtime.EventResolutionUpdated, "admin", "", nil)
	})
	if err == nil {
		state, _ := s.GetCurrentResolution(ctx)
		s.hub.Publish(realtime.Event{Type: realtime.EventResolutionUpdated, Revision: revision, Payload: state})
	}
	return err
}

func (s *ResolutionService) ApplyPassedAmendment(ctx context.Context, tx *sql.Tx, amendment domain.Amendment) error {
	resolutions := repository.NewResolutionRepository(tx)
	switch amendment.Type {
	case domain.AmendmentAdd:
		_, err := resolutions.AddPoint(ctx, amendment.Text, &amendment.ID)
		return err
	case domain.AmendmentUpdate:
		if amendment.TargetPointID == nil {
			return NewUserError("missing_target", "Pro změnu bodu chybí cílový bod.")
		}
		return resolutions.UpdatePoint(ctx, *amendment.TargetPointID, amendment.Text)
	case domain.AmendmentRemove:
		if amendment.TargetPointID == nil {
			return NewUserError("missing_target", "Pro odstranění bodu chybí cílový bod.")
		}
		if err := resolutions.RemovePoint(ctx, *amendment.TargetPointID); err != nil {
			return err
		}
		return resolutions.Renumber(ctx)
	default:
		return NewUserError("invalid_amendment_type", "Neplatný typ pozměňovacího návrhu.")
	}
}
