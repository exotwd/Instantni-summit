package controller

import (
	"encoding/csv"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mun-app/internal/domain"
)

func (api *API) LayoutImport(w http.ResponseWriter, r *http.Request) {
	current, err := api.attendance.List(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	rows, err := readUploadedTable(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_import", err.Error())
		return
	}
	seats, skipped := parseLayoutRows(rows, current.Delegations)
	if err := api.delegations.UpdateSeats(r.Context(), seats); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imported": len(seats), "skipped": skipped})
}

func (api *API) AgendaImport(w http.ResponseWriter, r *http.Request) {
	rows, err := readUploadedTable(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_import", err.Error())
		return
	}
	items, skipped := parseAgendaRows(rows)
	if err := api.agenda.ReplaceAgendaItems(r.Context(), items); err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imported": len(items), "skipped": skipped})
}

func readUploadedTable(r *http.Request) ([][]string, error) {
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		return nil, errors.New("Soubor se nepodařilo načíst.")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, errors.New("Chybí soubor.")
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, errors.New("Soubor se nepodařilo přečíst.")
	}
	name := strings.ToLower(header.Filename)
	if strings.HasSuffix(name, ".csv") || strings.HasSuffix(name, ".tsv") || strings.HasSuffix(name, ".txt") {
		return parseDelimitedRows(data, strings.HasSuffix(name, ".tsv"))
	}
	return parseXLSXRows(data)
}

func parseDelimitedRows(data []byte, tab bool) ([][]string, error) {
	reader := csv.NewReader(strings.NewReader(string(data)))
	reader.FieldsPerRecord = -1
	if tab {
		reader.Comma = '\t'
	}
	rows, err := reader.ReadAll()
	if err != nil {
		return nil, errors.New("CSV/TSV soubor se nepodařilo přečíst.")
	}
	return rows, nil
}

func parseLayoutRows(rows [][]string, delegations []domain.Delegation) ([]domain.SeatLayout, int) {
	if len(rows) < 2 {
		return nil, 0
	}
	headers := tableHeaders(rows[0])
	codeToID := map[string]int64{}
	nameToID := map[string]int64{}
	for _, d := range delegations {
		codeToID[normalizeHeader(d.Code)] = d.ID
		nameToID[normalizeCountryName(d.Name)] = d.ID
		nameToID[normalizeHeader(d.Name)] = d.ID
	}
	out := []domain.SeatLayout{}
	skipped := 0
	for _, row := range rows[1:] {
		id := int64Cell(row, headers, "delegation id", "id")
		if id == 0 {
			id = codeToID[normalizeHeader(firstCell(row, headers, "zkratka", "code"))]
		}
		if id == 0 {
			id = nameToID[normalizeCountryName(firstCell(row, headers, "stat", "stát", "country", "delegace", "delegation"))]
		}
		if id == 0 {
			skipped++
			continue
		}
		if firstCell(row, headers, "x") == "" || firstCell(row, headers, "y") == "" {
			skipped++
			continue
		}
		seat := domain.SeatLayout{
			DelegationID: id,
			X:            clampFloat(floatCell(row, headers, 0, "x"), 0, 100),
			Y:            clampFloat(floatCell(row, headers, 0, "y"), 0, 100),
			W:            clampFloat(floatCell(row, headers, 10, "w", "width", "sirka", "šířka"), 3, 40),
			H:            clampFloat(floatCell(row, headers, 8, "h", "height", "vyska", "výška"), 3, 30),
			Rotation:     clampFloat(floatCell(row, headers, 0, "rotation", "rotace", "r"), -180, 180),
		}
		seat.X = clampFloat(seat.X, 0, 100-seat.W)
		seat.Y = clampFloat(seat.Y, 0, 100-seat.H)
		out = append(out, seat)
	}
	return out, skipped
}

func parseAgendaRows(rows [][]string) ([]domain.AgendaItem, int) {
	if len(rows) < 2 {
		return nil, 0
	}
	headers := tableHeaders(rows[0])
	out := []domain.AgendaItem{}
	skipped := 0
	for index, row := range rows[1:] {
		title := firstCell(row, headers, "nazev", "název", "title", "bod", "agenda")
		if strings.TrimSpace(title) == "" {
			skipped++
			continue
		}
		duration := intCell(row, headers, 0, "trvani", "trvání", "duration", "duration minutes", "min", "minutes")
		var durationPtr *int
		if duration > 0 {
			durationPtr = &duration
		}
		start := parseAgendaStart(firstCell(row, headers, "cas", "čas", "zacatek", "začátek", "start", "starts at"))
		item := domain.AgendaItem{
			Title:           title,
			Type:            normalizeAgendaType(firstCell(row, headers, "typ", "type")),
			StartsAt:        start,
			DurationMinutes: durationPtr,
			Note:            firstCell(row, headers, "poznamka", "poznámka", "note", "notes"),
			DisplayOrder:    intCell(row, headers, index+1, "poradi", "pořadí", "order", "display order"),
		}
		if item.Type == "" {
			item.Type = domain.AgendaOther
		}
		out = append(out, item)
	}
	return out, skipped
}

func tableHeaders(row []string) map[string]int {
	headers := map[string]int{}
	for i, header := range row {
		header = strings.TrimPrefix(header, "\ufeff")
		headers[normalizeHeader(header)] = i
	}
	return headers
}

func firstCell(row []string, headers map[string]int, names ...string) string {
	for _, name := range names {
		if value := cell(row, headers, normalizeHeader(name)); value != "" {
			return value
		}
	}
	return ""
}

func int64Cell(row []string, headers map[string]int, names ...string) int64 {
	value := firstCell(row, headers, names...)
	value = strings.TrimSpace(strings.TrimSuffix(value, ".0"))
	n, _ := strconv.ParseInt(value, 10, 64)
	return n
}

func intCell(row []string, headers map[string]int, fallback int, names ...string) int {
	value := firstCell(row, headers, names...)
	if value == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64)
	if err != nil {
		return fallback
	}
	return int(math.Round(f))
}

func floatCell(row []string, headers map[string]int, fallback float64, names ...string) float64 {
	value := firstCell(row, headers, names...)
	if value == "" {
		return fallback
	}
	f, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64)
	if err != nil {
		return fallback
	}
	return f
}

func parseAgendaStart(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if parsed, err := time.Parse("15:04", value); err == nil {
		t := time.Date(2000, 1, 1, parsed.Hour(), parsed.Minute(), 0, 0, time.Local)
		return &t
	}
	if parsed, err := time.Parse("15:04:05", value); err == nil {
		t := time.Date(2000, 1, 1, parsed.Hour(), parsed.Minute(), parsed.Second(), 0, time.Local)
		return &t
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed
	}
	if f, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", "."), 64); err == nil {
		if f >= 0 && f < 1 {
			totalSeconds := int(math.Round(f * 24 * 60 * 60))
			t := time.Date(2000, 1, 1, totalSeconds/3600, (totalSeconds%3600)/60, totalSeconds%60, 0, time.Local)
			return &t
		}
	}
	return nil
}

func normalizeAgendaType(value string) string {
	switch normalizeHeader(value) {
	case "jednani", "session":
		return domain.AgendaSession
	case "přestávka", "prestávka", "prestavka", "break":
		return domain.AgendaBreak
	case "kuloar", "kuloarni jednani", "caucus":
		return domain.AgendaCaucus
	case "hlasovani", "voting":
		return domain.AgendaVoting
	case "organizacni", "organizational":
		return domain.AgendaOrganizational
	case "jine", "other":
		return domain.AgendaOther
	default:
		return strings.TrimSpace(value)
	}
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
