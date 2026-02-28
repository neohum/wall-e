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

		daySubjects := make([]string, 5)
		for d := 0; d < 5; d++ {
			if 3+d < len(cols) {
				daySubjects[d] = strings.TrimSpace(cols[3+d])
			}
		}
		subjects = append(subjects, daySubjects)
	}

	if len(periods) == 0 {
		return nil
	}

	return &TimetableData{Periods: periods, Subjects: subjects}
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

func parseDateToYYYYMMDD(raw string) string {
	re1 := regexp.MustCompile(`^(\d{4})[-./](\d{1,2})[-./](\d{1,2})`)
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

	re2 := regexp.MustCompile(`^(\d{4})(\d{2})(\d{2})$`)
	if matches := re2.FindStringSubmatch(raw); len(matches) > 3 {
		return matches[1] + matches[2] + matches[3]
	}

	return ""
}
