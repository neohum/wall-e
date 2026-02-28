package main

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type TimetableData struct {
	Headers  []string     `json:"headers"`
	Periods  []PeriodTime `json:"periods"`
	Subjects [][]string   `json:"subjects"`
}

type PeriodTime struct {
	Period int    `json:"period"`
	Start  string `json:"start"`
	End    string `json:"end"`
}

func extractSpreadsheetID(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	re := regexp.MustCompile(`/spreadsheets/d/([a-zA-Z0-9_-]+)`)
	if matches := re.FindStringSubmatch(input); len(matches) > 1 {
		return matches[1]
	}

	bareRe := regexp.MustCompile(`^[a-zA-Z0-9_-]{10,}$`)
	if bareRe.MatchString(input) {
		return input
	}

	return ""
}

func parseCSV(csvText string) [][]string {
	var rows [][]string
	var current strings.Builder
	inQuotes := false
	var row []string

	for i := 0; i < len(csvText); i++ {
		ch := csvText[i]

		if inQuotes {
			if ch == '"' && i+1 < len(csvText) && csvText[i+1] == '"' {
				current.WriteByte('"')
				i++
			} else if ch == '"' {
				inQuotes = false
			} else {
				current.WriteByte(ch)
			}
		} else {
			if ch == '"' {
				inQuotes = true
			} else if ch == ',' {
				row = append(row, current.String())
				current.Reset()
			} else if ch == '\r' && i+1 < len(csvText) && csvText[i+1] == '\n' {
				row = append(row, current.String())
				current.Reset()
				rows = append(rows, row)
				row = nil
				i++
			} else if ch == '\n' {
				row = append(row, current.String())
				current.Reset()
				rows = append(rows, row)
				row = nil
			} else {
				current.WriteByte(ch)
			}
		}
	}

	if current.Len() > 0 || len(row) > 0 {
		row = append(row, current.String())
		rows = append(rows, row)
	}

	return rows
}

func csvToTimetableData(rows [][]string) *TimetableData {
	if len(rows) < 2 {
		return nil
	}

	// Extract headers from the first row (columns after 교시/시작/종료)
	headerRow := rows[0]
	var headers []string
	for i := 3; i < len(headerRow); i++ {
		headers = append(headers, strings.TrimSpace(headerRow[i]))
	}
	numDayCols := len(headers)
	if numDayCols == 0 {
		numDayCols = 5 // fallback
		headers = []string{"월", "화", "수", "목", "금"}
	}

	dataRows := rows[1:]
	var periods []PeriodTime
	var subjects [][]string
	timeRe := regexp.MustCompile(`^\d{1,2}:\d{2}$`)

	for _, cols := range dataRows {
		if len(cols) < 3 {
			continue
		}
		periodNum, err := strconv.Atoi(strings.TrimSpace(cols[0]))
		if err != nil {
			continue
		}
		start := strings.TrimSpace(cols[1])
		end := strings.TrimSpace(cols[2])
		if !timeRe.MatchString(start) || !timeRe.MatchString(end) {
			continue
		}

		// Normalize to HH:MM
		if len(start) == 4 {
			start = "0" + start
		}
		if len(end) == 4 {
			end = "0" + end
		}

		periods = append(periods, PeriodTime{Period: periodNum, Start: start, End: end})

		daySubjects := make([]string, numDayCols)
		for d := 0; d < numDayCols; d++ {
			if 3+d < len(cols) {
				daySubjects[d] = strings.TrimSpace(cols[3+d])
			}
		}
		subjects = append(subjects, daySubjects)
	}

	if len(periods) == 0 {
		return nil
	}

	return &TimetableData{Headers: headers, Periods: periods, Subjects: subjects}
}

func fetchTimetableFromSheet(spreadsheetURL string) (*TimetableData, error) {
	sheetID := extractSpreadsheetID(spreadsheetURL)
	if sheetID == "" {
		return nil, nil
	}

	csvURL := fmt.Sprintf("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv", sheetID)
	resp, err := http.Get(csvURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("spreadsheet CSV returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	rows := parseCSV(string(body))
	return csvToTimetableData(rows), nil
}

func fetchEventsFromSheet(spreadsheetURL string) ([]ScheduleEvent, error) {
	sheetID := extractSpreadsheetID(spreadsheetURL)
	if sheetID == "" {
		return nil, nil
	}

	csvURL := fmt.Sprintf("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s", sheetID, url.QueryEscape("행사"))
	resp, err := http.Get(csvURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	rows := parseCSV(string(body))
	return csvToEvents(rows), nil
}

func csvToEvents(rows [][]string) []ScheduleEvent {
	if len(rows) < 2 {
		return nil
	}

	dataRows := rows[1:]
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	cutoff := today.AddDate(0, 2, 0)

	var events []ScheduleEvent
	for _, cols := range dataRows {
		if len(cols) < 2 {
			continue
		}
		rawDate := strings.TrimSpace(cols[0])
		name := strings.TrimSpace(cols[1])
		if rawDate == "" || name == "" {
			continue
		}

		dateStr := parseDateToYYYYMMDD(rawDate)
		if dateStr == "" {
			continue
		}

		y, _ := strconv.Atoi(dateStr[:4])
		m, _ := strconv.Atoi(dateStr[4:6])
		d, _ := strconv.Atoi(dateStr[6:8])
		eventDate := time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.Local)
		if eventDate.Before(today) || eventDate.After(cutoff) {
			continue
		}

		ev := ScheduleEvent{Date: dateStr, Name: name}
		if len(cols) > 2 {
			detail := strings.TrimSpace(cols[2])
			if detail != "" {
				ev.Detail = detail
			}
		}
		events = append(events, ev)
	}

	return events
}

// ===== Study Plan =====
// Actual sheet format (repeating blocks):
//   Row: "1학기 1주차 (2026.03.01.~2026.03.08.)", "", "", "", "", ""   <- title row (contains date range in parens)
//   Row: "", "월요일", "화요일", "수요일", "목요일", "금요일"              <- header row (col[0] empty, rest = day names)
//   Row: "1교시", "대\n체\n공\n휴\n일", "", "자율활동", "자율활동", ...  <- data rows (col[0] = period label or empty for continuation)
//   Row: "", "", "", "세부내용", "세부내용", ...                         <- continuation row (col[0] empty)
//   ...next block repeats

type StudyPlanBlock struct {
	Title   string     `json:"title"`
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

type StudyPlanResult struct {
	Blocks       []StudyPlanBlock `json:"blocks"`
	CurrentIndex int              `json:"currentIndex"` // index of block containing today, -1 if none
}

func fetchStudyPlanFromSheet(spreadsheetURL string) (*StudyPlanResult, error) {
	sheetID := extractSpreadsheetID(spreadsheetURL)
	if sheetID == "" {
		return nil, nil
	}

	csvURL := fmt.Sprintf("https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s", sheetID, url.QueryEscape("주학습계획안"))
	resp, err := http.Get(csvURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	rows := parseCSV(string(body))
	return csvToStudyPlan(rows), nil
}

// extractDateRange extracts start and end YYYYMMDD from a title like
// "1학기 1주차 (2026.03.01.~2026.03.08.)"
// Returns ("","") if no date range found.
func extractDateRange(title string) (string, string) {
	// Find content inside parentheses
	re := regexp.MustCompile(`\(([^)]+)\)`)
	m := re.FindStringSubmatch(title)
	if len(m) < 2 {
		return "", ""
	}
	inner := m[1] // e.g. "2026.03.01.~2026.03.08."

	parts := strings.SplitN(inner, "~", 2)
	if len(parts) != 2 {
		// Single date in parens
		d := parseDateToYYYYMMDD(strings.TrimSpace(parts[0]))
		return d, d
	}

	start := parseDateToYYYYMMDD(strings.TrimSpace(parts[0]))
	end := parseDateToYYYYMMDD(strings.TrimSpace(parts[1]))
	if start == "" || end == "" {
		return "", ""
	}
	return start, end
}

// isTitleRow detects the block title row: col[0] has text, cols[1:] are all empty.
func isTitleRow(row []string) bool {
	if len(row) == 0 || strings.TrimSpace(row[0]) == "" {
		return false
	}
	for i := 1; i < len(row); i++ {
		if strings.TrimSpace(row[i]) != "" {
			return false
		}
	}
	return true
}

// isHeaderRow detects the day-name header row: col[0] is empty, cols[1:] contain day names.
func isHeaderRow(row []string) bool {
	if len(row) < 2 {
		return false
	}
	if strings.TrimSpace(row[0]) != "" {
		return false
	}
	// At least one col should contain a day-like string
	for i := 1; i < len(row); i++ {
		v := strings.TrimSpace(row[i])
		if strings.Contains(v, "요일") || v == "월" || v == "화" || v == "수" || v == "목" || v == "금" {
			return true
		}
	}
	return false
}

func csvToStudyPlan(rows [][]string) *StudyPlanResult {
	if len(rows) < 3 {
		return nil
	}

	now := time.Now()
	todayStr := fmt.Sprintf("%04d%02d%02d", now.Year(), int(now.Month()), now.Day())

	type rawBlock struct {
		title     string
		startDate string
		endDate   string
		rows      [][]string
	}

	// Split into blocks by title rows
	var rawBlocks []rawBlock
	for _, row := range rows {
		if len(row) == 0 {
			continue
		}
		if isTitleRow(row) {
			title := strings.TrimSpace(row[0])
			start, end := extractDateRange(title)
			rawBlocks = append(rawBlocks, rawBlock{title: title, startDate: start, endDate: end})
		} else if len(rawBlocks) > 0 {
			rawBlocks[len(rawBlocks)-1].rows = append(rawBlocks[len(rawBlocks)-1].rows, row)
		}
	}

	if len(rawBlocks) == 0 {
		return nil
	}

	// Parse each block into StudyPlanBlock
	var blocks []StudyPlanBlock
	currentIndex := -1

	for _, rb := range rawBlocks {
		parsed := parseStudyPlanBlock(rb.title, rb.rows)
		if parsed == nil {
			continue
		}
		idx := len(blocks)
		blocks = append(blocks, *parsed)

		if currentIndex < 0 && rb.startDate != "" && rb.endDate != "" {
			if todayStr >= rb.startDate && todayStr <= rb.endDate {
				currentIndex = idx
			}
		}
	}

	if len(blocks) == 0 {
		return nil
	}

	// If no block contains today, default to the last block
	if currentIndex < 0 {
		currentIndex = len(blocks) - 1
	}

	return &StudyPlanResult{
		Blocks:       blocks,
		CurrentIndex: currentIndex,
	}
}

func parseStudyPlanBlock(title string, rows [][]string) *StudyPlanBlock {
	if len(rows) < 2 {
		return nil
	}

	// Find header row
	headerIdx := -1
	for i, row := range rows {
		if isHeaderRow(row) {
			headerIdx = i
			break
		}
	}
	if headerIdx < 0 {
		return nil
	}

	headerRow := rows[headerIdx]
	var headers []string
	for i := 1; i < len(headerRow); i++ {
		h := strings.TrimSpace(headerRow[i])
		if h != "" {
			headers = append(headers, h)
		}
	}
	if len(headers) == 0 {
		return nil
	}
	numCols := len(headers)

	// Collect data rows after header, merging continuation rows
	type periodRow struct {
		label string
		cells []string
	}

	var periods []periodRow
	for _, row := range rows[headerIdx+1:] {
		col0 := strings.TrimSpace(row[0])

		cells := make([]string, numCols)
		for j := 0; j < numCols; j++ {
			if j+1 < len(row) {
				cells[j] = strings.TrimSpace(row[j+1])
			}
		}

		if col0 != "" {
			periods = append(periods, periodRow{label: col0, cells: cells})
		} else if len(periods) > 0 {
			last := &periods[len(periods)-1]
			for j := 0; j < numCols; j++ {
				if cells[j] != "" {
					if last.cells[j] != "" {
						last.cells[j] += "\n" + cells[j]
					} else {
						last.cells[j] = cells[j]
					}
				}
			}
		}
	}

	if len(periods) == 0 {
		return nil
	}

	var dataRows [][]string
	for _, p := range periods {
		row := make([]string, numCols+1)
		row[0] = p.label
		copy(row[1:], p.cells)
		dataRows = append(dataRows, row)
	}

	return &StudyPlanBlock{
		Title:   title,
		Headers: headers,
		Rows:    dataRows,
	}
}

func parseDateToYYYYMMDD(raw string) string {
	raw = strings.TrimSpace(raw)

	// YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD (with optional spaces around separators)
	re1 := regexp.MustCompile(`^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})`)
	if matches := re1.FindStringSubmatch(raw); len(matches) > 3 {
		m := matches[2]
		d := matches[3]
		if len(m) == 1 {
			m = "0" + m
		}
		if len(d) == 1 {
			d = "0" + d
		}
		return matches[1] + m + d
	}

	// YYYYMMDD
	re2 := regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})$`)
	if matches := re2.FindStringSubmatch(raw); len(matches) > 3 {
		return matches[1] + matches[2] + matches[3]
	}

	// M/D/YYYY or MM/DD/YYYY (Google Sheets US locale)
	re3 := regexp.MustCompile(`^(\d{1,2})/(\d{1,2})/(\d{4})$`)
	if matches := re3.FindStringSubmatch(raw); len(matches) > 3 {
		m := matches[1]
		d := matches[2]
		if len(m) == 1 {
			m = "0" + m
		}
		if len(d) == 1 {
			d = "0" + d
		}
		return matches[3] + m + d
	}

	return ""
}
