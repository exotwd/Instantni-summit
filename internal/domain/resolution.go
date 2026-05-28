package domain

import "time"

const (
	ResolutionActive  = "active"
	ResolutionRemoved = "removed"
	ResolutionDraft   = "draft"
)

var DefaultResolutionTemplatePoints = []string{
	"odvolávajíc se na zakládající smlouvy EU,",
	"přihlížejíc k Úmluvě o ochraně lidských práv a základních svobod,",
	"podporuje…",
	"bude se situací dále aktivně zabývat.",
}

type ResolutionPoint struct {
	ID                int64      `json:"id"`
	Number            int        `json:"number"`
	Text              string     `json:"text"`
	Status            string     `json:"status"`
	SourceAmendmentID *int64     `json:"sourceAmendmentId,omitempty"`
	Template          bool       `json:"template"`
	SourcePNNumber    int        `json:"sourcePnNumber,omitempty"`
	SubmitterName     string     `json:"submitterName,omitempty"`
	GuarantorsText    string     `json:"guarantorsText,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	RemovedAt         *time.Time `json:"removedAt,omitempty"`
}

type ResolutionSnapshot struct {
	Revision int64             `json:"revision"`
	Points   []ResolutionPoint `json:"points"`
	HTML     string            `json:"html"`
}
