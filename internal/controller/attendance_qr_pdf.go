package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"sort"
	"strings"

	qrcode "github.com/skip2/go-qrcode"

	"mun-app/internal/domain"
)

const (
	pdfPageW = 595.28
	pdfPageH = 841.89
)

func (api *API) AttendanceQRExport(w http.ResponseWriter, r *http.Request) {
	state, err := api.attendance.List(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	if missingVoteLink(state.Delegations) {
		state, err = api.attendance.GenerateVoteLinks(r.Context())
		if err != nil {
			writeServiceError(w, err)
			return
		}
	}
	data, err := buildAttendanceQRPdf(state.Delegations, requestBaseURL(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "pdf_failed", "PDF s QR kódy se nepodařilo vytvořit.")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="hlasovaci-qr-kody.pdf"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func missingVoteLink(delegations []domain.Delegation) bool {
	for _, delegation := range delegations {
		if delegation.VoteLinkToken == "" {
			return true
		}
	}
	return false
}

func buildAttendanceQRPdf(delegations []domain.Delegation, baseURL string) ([]byte, error) {
	sort.SliceStable(delegations, func(i, j int) bool {
		if delegations[i].DisplayOrder == delegations[j].DisplayOrder {
			return delegations[i].Name < delegations[j].Name
		}
		return delegations[i].DisplayOrder < delegations[j].DisplayOrder
	})
	pageCount := (len(delegations) + 5) / 6
	if pageCount == 0 {
		pageCount = 1
	}

	var objects []string
	add := func(body string) int {
		objects = append(objects, body)
		return len(objects)
	}

	catalogID := add("<< /Type /Catalog /Pages 2 0 R >>")
	_ = catalogID
	pagesID := add("")
	fontRegularID := add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	fontBoldID := add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
	var pageIDs []int

	for pageIndex := 0; pageIndex < pageCount; pageIndex++ {
		content, err := qrPageContent(delegations, pageIndex, baseURL)
		if err != nil {
			return nil, err
		}
		contentID := add(pdfStream(content))
		pageID := add(fmt.Sprintf("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>",
			pagesID, pdfPageW, pdfPageH, fontRegularID, fontBoldID, contentID))
		pageIDs = append(pageIDs, pageID)
	}

	kids := make([]string, 0, len(pageIDs))
	for _, id := range pageIDs {
		kids = append(kids, fmt.Sprintf("%d 0 R", id))
	}
	objects[pagesID-1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), len(pageIDs))

	var pdf bytes.Buffer
	pdf.WriteString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
	offsets := make([]int, len(objects)+1)
	for i, body := range objects {
		offsets[i+1] = pdf.Len()
		fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", i+1, body)
	}
	xref := pdf.Len()
	fmt.Fprintf(&pdf, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&pdf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&pdf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return pdf.Bytes(), nil
}

func qrPageContent(delegations []domain.Delegation, pageIndex int, baseURL string) (string, error) {
	var b strings.Builder
	cardW := (pdfPageW - 72) / 2
	cardH := (pdfPageH - 92) / 3
	marginX := 28.0
	marginTop := 30.0
	gap := 16.0
	start := pageIndex * 6
	end := start + 6
	if end > len(delegations) {
		end = len(delegations)
	}
	for i := start; i < end; i++ {
		slot := i - start
		col := slot % 2
		row := slot / 2
		x := marginX + float64(col)*(cardW+gap)
		top := marginTop + float64(row)*(cardH+gap)
		drawQRCard(&b, x, top, cardW, cardH, delegations[i], baseURL)
	}
	return b.String(), nil
}

func drawQRCard(b *strings.Builder, x, top, w, h float64, delegation domain.Delegation, baseURL string) {
	y := pdfPageH - top - h
	link := voteLinkPath(baseURL, delegation.VoteLinkToken)
	roundedRect(b, x, y, w, h, 10, "0.96 0.97 0.99 rg", "f")
	roundedRect(b, x, y, w, h, 10, "0.82 0.86 0.92 RG", "S")
	roundedRect(b, x+12, y+h-48, w-24, 34, 8, "0 0.2 0.6 rg", "f")
	text(b, x+22, y+h-36, 13, "F2", "1 1 1 rg", shortenPDFText(stripDiacritics(delegation.Name), 28))
	text(b, x+w-54, y+h-36, 12, "F2", "1 1 1 rg", stripDiacritics(delegation.Code))

	qrBox := 148.0
	qrX := x + (w-qrBox)/2
	qrY := y + 52
	roundedRect(b, qrX-14, qrY-14, qrBox+28, qrBox+42, 14, "1 1 1 rg", "f")
	roundedRect(b, qrX-14, qrY-14, qrBox+28, qrBox+42, 14, "0.86 0.88 0.92 RG", "S")
	drawQRCode(b, link, qrX, qrY+20, qrBox)
	text(b, x+20, y+26, 8, "F1", "0.24 0.28 0.36 rg", "Odkaz pro hlasovani")
	text(b, x+20, y+14, 7, "F1", "0.36 0.40 0.48 rg", shortenPDFText(link, 54))
}

func drawQRCode(b *strings.Builder, value string, x, y, size float64) {
	qr, err := qrcode.New(value, qrcode.Medium)
	if err != nil {
		return
	}
	qr.DisableBorder = true
	matrix := qr.Bitmap()
	if len(matrix) == 0 {
		return
	}
	module := size / float64(len(matrix))
	b.WriteString("0 0 0 rg\n")
	for row, cells := range matrix {
		for col, dark := range cells {
			if !dark {
				continue
			}
			px := x + float64(col)*module
			py := y + size - float64(row+1)*module
			fmt.Fprintf(b, "%.3f %.3f %.3f %.3f re f\n", px, py, module+0.02, module+0.02)
		}
	}
}

func roundedRect(b *strings.Builder, x, y, w, h, r float64, color, op string) {
	k := 0.5522847498
	if color != "" {
		b.WriteString(color)
		b.WriteByte('\n')
	}
	fmt.Fprintf(b, "%.3f %.3f m\n", x+r, y)
	fmt.Fprintf(b, "%.3f %.3f l\n", x+w-r, y)
	fmt.Fprintf(b, "%.3f %.3f %.3f %.3f %.3f %.3f c\n", x+w-r+k*r, y, x+w, y+r-k*r, x+w, y+r)
	fmt.Fprintf(b, "%.3f %.3f l\n", x+w, y+h-r)
	fmt.Fprintf(b, "%.3f %.3f %.3f %.3f %.3f %.3f c\n", x+w, y+h-r+k*r, x+w-r+k*r, y+h, x+w-r, y+h)
	fmt.Fprintf(b, "%.3f %.3f l\n", x+r, y+h)
	fmt.Fprintf(b, "%.3f %.3f %.3f %.3f %.3f %.3f c\n", x+r-k*r, y+h, x, y+h-r+k*r, x, y+h-r)
	fmt.Fprintf(b, "%.3f %.3f l\n", x, y+r)
	fmt.Fprintf(b, "%.3f %.3f %.3f %.3f %.3f %.3f c\n", x, y+r-k*r, x+r-k*r, y, x+r, y)
	b.WriteString("h ")
	b.WriteString(op)
	b.WriteByte('\n')
}

func text(b *strings.Builder, x, y, size float64, font, color, value string) {
	if color != "" {
		b.WriteString(color)
		b.WriteByte('\n')
	}
	fmt.Fprintf(b, "BT /%s %.1f Tf %.3f %.3f Td (%s) Tj ET\n", font, size, x, y, pdfEscape(value))
}

func pdfStream(content string) string {
	return fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content)
}

func pdfEscape(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, "(", `\(`)
	value = strings.ReplaceAll(value, ")", `\)`)
	return value
}

func shortenPDFText(value string, max int) string {
	if len(value) <= max {
		return value
	}
	if max <= 3 {
		return value[:max]
	}
	return value[:max-3] + "..."
}

func stripDiacritics(value string) string {
	replacer := strings.NewReplacer(
		"\u00e1", "a", "\u010d", "c", "\u010f", "d", "\u00e9", "e", "\u011b", "e", "\u00ed", "i", "\u0148", "n", "\u00f3", "o", "\u0159", "r", "\u0161", "s", "\u0165", "t", "\u00fa", "u", "\u016f", "u", "\u00fd", "y", "\u017e", "z",
		"\u00c1", "A", "\u010c", "C", "\u010e", "D", "\u00c9", "E", "\u011a", "E", "\u00cd", "I", "\u0147", "N", "\u00d3", "O", "\u0158", "R", "\u0160", "S", "\u0164", "T", "\u00da", "U", "\u016e", "U", "\u00dd", "Y", "\u017d", "Z",
	)
	return replacer.Replace(value)
}
