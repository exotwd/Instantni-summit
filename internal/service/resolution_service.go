package service

import (
	"context"
	"database/sql"
	"html"
	"strconv"
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
	amendments, err := repository.NewAmendmentRepository(s.db).List(ctx)
	if err != nil {
		return domain.ResolutionSnapshot{}, err
	}
	revision, err := repository.NewEventRepository(s.db).Revision(ctx, "resolution")
	if err != nil {
		return domain.ResolutionSnapshot{}, err
	}
	return domain.ResolutionSnapshot{Revision: revision, Points: points, HTML: RenderResolutionHTML(points, amendments)}, nil
}

func RenderResolutionHTML(points []domain.ResolutionPoint, amendments []domain.Amendment) string {
	var b strings.Builder
	b.WriteString(`<section class="resolution-template">`)
	b.WriteString(`<div class="resolution-kicker">Evropská rada</div>`)
	b.WriteString(`<div class="resolution-meta"><strong>OTÁZKA SE TÝKÁ:</strong> Rozšiřování EU</div>`)
	b.WriteString(`<div class="resolution-meta"><strong>PŘEDKLADATEL:</strong> Předsednictvo Evropské rady</div>`)
	b.WriteString(`<p class="resolution-lead">Evropská rada zaujímá společný postoj, který</p>`)
	b.WriteString("<ol>")
	for _, point := range points {
		b.WriteString("<li>")
		b.WriteString(html.EscapeString(point.Text))
		b.WriteString("</li>")
	}
	for _, amendment := range amendments {
		if amendment.Status != domain.AmendmentAccepted && amendment.Status != domain.AmendmentIntroduced {
			continue
		}
		className := "accepted"
		if amendment.Status == domain.AmendmentIntroduced {
			className = "introduced"
		}
		b.WriteString(`<li class="resolution-pending `)
		b.WriteString(className)
		b.WriteString(`">`)
		b.WriteString(html.EscapeString(amendmentWorkingText(amendment)))
		b.WriteString("</li>")
	}
	b.WriteString("</ol>")
	b.WriteString("</section>")
	return b.String()
}

func amendmentWorkingText(amendment domain.Amendment) string {
	text := strings.TrimSpace(amendment.Text)
	switch amendment.Type {
	case domain.AmendmentUpdate:
		return "PN " + strconv.Itoa(amendment.Number) + " - upravit bod: " + text
	case domain.AmendmentRemove:
		return "PN " + strconv.Itoa(amendment.Number) + " - odstranit bod"
	default:
		if text == "" {
			return "PN " + strconv.Itoa(amendment.Number)
		}
		return text + " (PN " + strconv.Itoa(amendment.Number) + ")"
	}
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
		if err := validateMutableResolutionTarget(ctx, resolutions, *amendment.TargetPointID); err != nil {
			return err
		}
		return resolutions.UpdatePoint(ctx, *amendment.TargetPointID, amendment.Text)
	case domain.AmendmentRemove:
		if amendment.TargetPointID == nil {
			return NewUserError("missing_target", "Pro odstranění bodu chybí cílový bod.")
		}
		if err := validateMutableResolutionTarget(ctx, resolutions, *amendment.TargetPointID); err != nil {
			return err
		}
		if err := resolutions.RemovePoint(ctx, *amendment.TargetPointID); err != nil {
			return err
		}
		return resolutions.Renumber(ctx)
	default:
		return NewUserError("invalid_amendment_type", "Neplatný typ pozměňovacího návrhu.")
	}
}

func validateMutableResolutionTarget(ctx context.Context, resolutions *repository.ResolutionRepository, id int64) error {
	point, err := resolutions.Get(ctx, id)
	if err != nil {
		return err
	}
	if point == nil || point.Status != domain.ResolutionActive {
		return NewUserError("invalid_target", "Cílový bod neexistuje nebo není aktivní.")
	}
	if point.Template {
		return NewUserError("default_resolution_locked", "Výchozí šablonu závěrů nelze měnit. PN může přidat nový bod nebo upravit jen bod vzniklý z PN.")
	}
	return nil
}
