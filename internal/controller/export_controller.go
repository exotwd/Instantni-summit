package controller

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"

	"mun-app/internal/domain"
)

func (api *API) ExportAllData(w http.ResponseWriter, r *http.Request) {
	state, err := api.screen.AdminState(r.Context())
	if err != nil {
		writeServiceError(w, err)
		return
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "export_failed", "Export dat se nepodarilo vytvorit.")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="mun-data.json"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (api *API) ExportResolutionDocx(w http.ResponseWriter, r *http.Request) {
	lines, err := api.cleanResolutionExportLines(r)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	data := buildResolutionDOCX(lines)
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	w.Header().Set("Content-Disposition", `attachment; filename="rezoluce.docx"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (api *API) ExportResolutionPDF(w http.ResponseWriter, r *http.Request) {
	lines, err := api.cleanResolutionExportLines(r)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	data := buildResolutionPDF(lines)
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="rezoluce.pdf"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (api *API) cleanResolutionExportLines(r *http.Request) ([]string, error) {
	resolution, err := api.resolution.GetCurrentResolution(r.Context())
	if err != nil {
		return nil, err
	}
	amendments, err := api.amendments.List(r.Context())
	if err != nil {
		return nil, err
	}
	lines := []string{
		"Evropska rada",
		"OTAZKA SE TYKA: Rozsirovani EU",
		"PREDKLADATEL: Predsednictvo Evropske rady",
		"Evropska rada zaujima spolecny postoj, ktery",
	}
	for _, point := range resolution.Points {
		if strings.TrimSpace(point.Text) == "" {
			continue
		}
		lines = append(lines, strconv.Itoa(point.Number)+". "+strings.TrimSpace(point.Text))
	}
	nextNumber := len(resolution.Points) + 1
	for _, amendment := range amendments {
		if amendment.Status != domain.AmendmentAccepted && amendment.Status != domain.AmendmentIntroduced {
			continue
		}
		text := strings.TrimSpace(exportAmendmentWorkingText(amendment))
		if text == "" {
			continue
		}
		lines = append(lines, strconv.Itoa(nextNumber)+". "+text)
		nextNumber++
	}
	return lines, nil
}

func exportAmendmentWorkingText(amendment domain.Amendment) string {
	text := strings.TrimSpace(amendment.Text)
	switch amendment.Type {
	case domain.AmendmentUpdate:
		if text == "" {
			return "upravit bod"
		}
		return "upravit bod: " + text
	case domain.AmendmentRemove:
		return "odstranit bod"
	default:
		return text
	}
}

func buildResolutionDOCX(lines []string) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	mustZipWrite(zw, "[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
	mustZipWrite(zw, "_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
	mustZipWrite(zw, "docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Rezoluce</dc:title><dc:creator>Instantni Summit</dc:creator></cp:coreProperties>`)
	mustZipWrite(zw, "docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Instantni Summit</Application></Properties>`)
	mustZipWrite(zw, "word/document.xml", resolutionDocumentXML(lines))
	_ = zw.Close()
	return buf.Bytes()
}

func resolutionDocumentXML(lines []string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`)
	for i, line := range lines {
		if i == 0 {
			b.WriteString(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>`)
			b.WriteString(html.EscapeString(line))
			b.WriteString(`</w:t></w:r></w:p>`)
			continue
		}
		b.WriteString(`<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">`)
		b.WriteString(html.EscapeString(line))
		b.WriteString(`</w:t></w:r></w:p>`)
	}
	b.WriteString(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`)
	return b.String()
}

func buildResolutionPDF(lines []string) []byte {
	pages := resolutionPDFPages(lines)
	var objects []string
	add := func(body string) int {
		objects = append(objects, body)
		return len(objects)
	}
	add("<< /Type /Catalog /Pages 2 0 R >>")
	pagesID := add("")
	fontRegularID := add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	fontBoldID := add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
	var pageIDs []int
	for _, content := range pages {
		contentID := add(pdfStream(content))
		pageID := add(fmt.Sprintf("<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>", pagesID, pdfPageW, pdfPageH, fontRegularID, fontBoldID, contentID))
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
	return pdf.Bytes()
}

func resolutionPDFPages(lines []string) []string {
	if len(lines) == 0 {
		lines = []string{"Rezoluce"}
	}
	var pages []string
	var b strings.Builder
	y := pdfPageH - 58
	newPage := func() {
		if b.Len() > 0 {
			pages = append(pages, b.String())
			b.Reset()
		}
		y = pdfPageH - 58
	}
	for i, line := range lines {
		size := 12.5
		font := "F1"
		if i == 0 {
			size = 20
			font = "F2"
		} else if i < 4 {
			font = "F2"
		}
		for _, wrapped := range wrapPDFLine(asciiPDFText(line), 88) {
			if y < 54 {
				newPage()
			}
			if i == 0 {
				centerText(&b, pdfPageW/2, y, size, font, "0 0.2 0.6 rg", wrapped)
			} else {
				text(&b, 54, y, size, font, "0 0 0 rg", wrapped)
			}
			y -= size + 7
		}
		if i == 0 || i == 3 {
			y -= 10
		}
	}
	if b.Len() > 0 {
		pages = append(pages, b.String())
	}
	return pages
}

func asciiPDFText(value string) string {
	value = stripDiacritics(value)
	var b strings.Builder
	for _, r := range value {
		if r >= 32 && r <= 126 {
			b.WriteRune(r)
			continue
		}
		switch r {
		case '\n', '\r', '\t':
			b.WriteByte(' ')
		default:
			b.WriteByte('-')
		}
	}
	return b.String()
}

func wrapPDFLine(value string, max int) []string {
	words := strings.Fields(value)
	if len(words) == 0 {
		return []string{""}
	}
	var out []string
	current := ""
	for _, word := range words {
		next := word
		if current != "" {
			next = current + " " + word
		}
		if len(next) > max && current != "" {
			out = append(out, current)
			current = word
			continue
		}
		current = next
	}
	if current != "" {
		out = append(out, current)
	}
	return out
}
