package controller

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"strconv"
	"strings"

	"mun-app/internal/domain"
)

var attendanceExportHeaders = []string{
	"Delegation ID", "Stát", "Zkratka", "Přítomen", "Hlasovací odkaz", "4místný kód", "Kód aktivní",
	"Jméno účastníka", "E-mail účastníka", "Jméno spoludelegáta", "E-mail spoludelegáta", "Poznámka",
}

func writeAttendanceXLSX(w http.ResponseWriter, state domain.AttendanceSnapshot, baseURL string) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	mustZipWrite(zw, "[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`)
	mustZipWrite(zw, "_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
	mustZipWrite(zw, "docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Prezence</dc:title><dc:creator>Instantni Summit</dc:creator>
</cp:coreProperties>`)
	mustZipWrite(zw, "docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Instantni Summit</Application>
</Properties>`)
	mustZipWrite(zw, "xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr date1904="false"/><sheets><sheet name="Prezence" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
	mustZipWrite(zw, "xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
	mustZipWrite(zw, "xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`)
	mustZipWrite(zw, "xl/worksheets/sheet1.xml", attendanceSheetXML(state, baseURL))
	_ = zw.Close()

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="prezence.xlsx"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}

func attendanceSheetXML(state domain.AttendanceSnapshot, baseURL string) string {
	var b strings.Builder
	lastRow := len(state.Delegations) + 1
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	fmt.Fprintf(&b, `<dimension ref="A1:L%d"/>`, lastRow)
	b.WriteString(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
	b.WriteString(`<cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="3" width="18" customWidth="1"/><col min="4" max="7" width="16" customWidth="1"/><col min="8" max="12" width="24" customWidth="1"/></cols>`)
	b.WriteString(`<sheetData>`)
	writeXLSXRow(&b, 1, attendanceExportHeaders)
	for i, d := range state.Delegations {
		p := d.Participant
		values := []string{
			strconv.FormatInt(d.ID, 10), d.Name, d.Code, boolText(d.Present), voteLinkPath(baseURL, d.VoteLinkToken), d.AccessCode, boolText(d.AccessCodeEnabled),
			"", "", "", "", "",
		}
		if p != nil {
			values[7] = p.Name
			values[8] = p.Email
			values[9] = p.CoDelegateName
			values[10] = p.CoDelegateEmail
			values[11] = p.Note
		}
		writeXLSXRow(&b, i+2, values)
	}
	b.WriteString(`</sheetData><autoFilter ref="A1:L`)
	b.WriteString(strconv.Itoa(lastRow))
	b.WriteString(`"/></worksheet>`)
	return b.String()
}

func writeXLSXRow(b *strings.Builder, rowNumber int, values []string) {
	b.WriteString(`<row r="`)
	b.WriteString(strconv.Itoa(rowNumber))
	b.WriteString(`">`)
	for i, value := range values {
		b.WriteString(`<c r="`)
		b.WriteString(columnName(i + 1))
		b.WriteString(strconv.Itoa(rowNumber))
		style := ""
		if rowNumber == 1 {
			style = ` s="1"`
		}
		b.WriteString(`"`)
		b.WriteString(style)
		b.WriteString(` t="inlineStr"><is><t xml:space="preserve">`)
		b.WriteString(html.EscapeString(value))
		b.WriteString(`</t></is></c>`)
	}
	b.WriteString(`</row>`)
}

func readAttendanceXLSX(r *http.Request, delegations []domain.Delegation) ([]domain.Participant, error) {
	if err := r.ParseMultipartForm(16 << 20); err != nil {
		return nil, errors.New("Soubor XLSX se nepodařilo načíst.")
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, errors.New("Chybí soubor XLSX.")
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, errors.New("Soubor XLSX se nepodařilo přečíst.")
	}
	rows, err := parseXLSXRows(data)
	if err != nil {
		return nil, err
	}
	if len(rows) < 2 {
		return nil, nil
	}
	codeToID := map[string]int64{}
	nameToID := map[string]int64{}
	for _, d := range delegations {
		codeToID[strings.ToLower(strings.TrimSpace(d.Code))] = d.ID
		nameToID[normalizeHeader(d.Name)] = d.ID
	}
	headers := map[string]int{}
	for i, header := range rows[0] {
		headers[normalizeHeader(header)] = i
	}
	var out []domain.Participant
	for _, row := range rows[1:] {
		id := int64(0)
		if raw := cell(row, headers, "delegation id"); raw != "" {
			id, _ = strconv.ParseInt(raw, 10, 64)
		}
		if id == 0 {
			id = codeToID[strings.ToLower(cell(row, headers, "zkratka"))]
		}
		if id == 0 {
			id = nameToID[normalizeHeader(cell(row, headers, "stat"))]
		}
		if id == 0 {
			continue
		}
		out = append(out, domain.Participant{
			DelegationID:    id,
			Name:            cell(row, headers, "jmeno ucastnika"),
			Email:           cell(row, headers, "e mail ucastnika"),
			CoDelegateName:  cell(row, headers, "jmeno spoludelegata"),
			CoDelegateEmail: cell(row, headers, "e mail spoludelegata"),
			Note:            cell(row, headers, "poznamka"),
		})
	}
	return out, nil
}

func parseXLSXRows(data []byte) ([][]string, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, errors.New("Soubor není platný XLSX.")
	}
	shared := []string{}
	if content, ok := zipRead(zr, "xl/sharedStrings.xml"); ok {
		shared = parseSharedStrings(content)
	}
	content, ok := zipRead(zr, "xl/worksheets/sheet1.xml")
	if !ok {
		return nil, errors.New("XLSX neobsahuje první list.")
	}
	var sheet xlsxWorksheet
	if err := xml.Unmarshal(content, &sheet); err != nil {
		return nil, errors.New("List XLSX se nepodařilo přečíst.")
	}
	var rows [][]string
	for _, row := range sheet.SheetData.Rows {
		values := []string{}
		for _, c := range row.Cells {
			index := columnIndex(c.Ref)
			for len(values) < index {
				values = append(values, "")
			}
			values[index-1] = c.value(shared)
		}
		rows = append(rows, values)
	}
	return rows, nil
}

type xlsxWorksheet struct {
	SheetData struct {
		Rows []xlsxRow `xml:"row"`
	} `xml:"sheetData"`
}

type xlsxRow struct {
	Cells []xlsxCell `xml:"c"`
}

type xlsxCell struct {
	Ref string `xml:"r,attr"`
	Type string `xml:"t,attr"`
	V string `xml:"v"`
	Inline struct {
		Text string `xml:"t"`
	} `xml:"is"`
}

func (c xlsxCell) value(shared []string) string {
	if c.Type == "inlineStr" {
		return strings.TrimSpace(c.Inline.Text)
	}
	if c.Type == "s" {
		i, _ := strconv.Atoi(strings.TrimSpace(c.V))
		if i >= 0 && i < len(shared) {
			return strings.TrimSpace(shared[i])
		}
	}
	return strings.TrimSpace(c.V)
}

type xlsxSharedStrings struct {
	Items []struct {
		Text string `xml:"t"`
	} `xml:"si"`
}

func parseSharedStrings(data []byte) []string {
	var stringsXML xlsxSharedStrings
	if err := xml.Unmarshal(data, &stringsXML); err != nil {
		return nil
	}
	out := make([]string, 0, len(stringsXML.Items))
	for _, item := range stringsXML.Items {
		out = append(out, item.Text)
	}
	return out
}

func zipRead(zr *zip.Reader, name string) ([]byte, bool) {
	for _, file := range zr.File {
		if file.Name != name {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return nil, false
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		return data, err == nil
	}
	return nil, false
}

func mustZipWrite(zw *zip.Writer, name, content string) {
	w, err := zw.Create(name)
	if err != nil {
		return
	}
	_, _ = w.Write([]byte(content))
}

func columnName(index int) string {
	name := ""
	for index > 0 {
		index--
		name = string(rune('A'+index%26)) + name
		index /= 26
	}
	return name
}

func columnIndex(ref string) int {
	index := 0
	for _, r := range ref {
		if r < 'A' || r > 'Z' {
			break
		}
		index = index*26 + int(r-'A'+1)
	}
	if index == 0 {
		return 1
	}
	return index
}

func cell(row []string, headers map[string]int, header string) string {
	index, ok := headers[header]
	if !ok || index < 0 || index >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[index])
}

func normalizeHeader(value string) string {
	replacer := strings.NewReplacer(
		"á", "a", "č", "c", "ď", "d", "é", "e", "ě", "e", "í", "i", "ň", "n", "ó", "o", "ř", "r", "š", "s", "ť", "t", "ú", "u", "ů", "u", "ý", "y", "ž", "z",
		"-", " ", "_", " ", ".", " ", "/", " ",
	)
	return strings.Join(strings.Fields(replacer.Replace(strings.ToLower(strings.TrimSpace(value)))), " ")
}

func boolText(value bool) string {
	if value {
		return "ano"
	}
	return "ne"
}

func voteLinkPath(baseURL, token string) string {
	if token == "" {
		return ""
	}
	if baseURL != "" {
		return fmt.Sprintf("%s/vote?token=%s", strings.TrimRight(baseURL, "/"), token)
	}
	return fmt.Sprintf("/vote?token=%s", token)
}
