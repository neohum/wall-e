package main

import (
	"fmt"
	"testing"
	"time"
)

// ============================================================
// extractSpreadsheetID
// ============================================================

func TestExtractSpreadsheetID_FullURL(t *testing.T) {
	input := "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0"
	got := extractSpreadsheetID(input)
	want := "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExtractSpreadsheetID_URLWithoutTrailingPath(t *testing.T) {
	input := "https://docs.google.com/spreadsheets/d/abc123XYZ_-abcdefghij"
	got := extractSpreadsheetID(input)
	want := "abc123XYZ_-abcdefghij"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExtractSpreadsheetID_BareIDExactlyTenChars(t *testing.T) {
	// 10 characters – the minimum accepted length for a bare ID.
	input := "abcdefghij"
	got := extractSpreadsheetID(input)
	want := "abcdefghij"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExtractSpreadsheetID_BareIDWithUnderscoreAndHyphen(t *testing.T) {
	input := "abc_def-ghij"
	got := extractSpreadsheetID(input)
	want := "abc_def-ghij"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExtractSpreadsheetID_BareIDTooShort(t *testing.T) {
	// 9 characters – just below the minimum; should not match.
	input := "abcdefghi"
	got := extractSpreadsheetID(input)
	if got != "" {
		t.Errorf("expected empty string for short bare ID, got %q", got)
	}
}

func TestExtractSpreadsheetID_EmptyString(t *testing.T) {
	got := extractSpreadsheetID("")
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestExtractSpreadsheetID_WhitespaceOnly(t *testing.T) {
	got := extractSpreadsheetID("   ")
	if got != "" {
		t.Errorf("expected empty string for whitespace-only input, got %q", got)
	}
}

func TestExtractSpreadsheetID_WhitespaceTrimmedBeforeMatch(t *testing.T) {
	input := "  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms  "
	got := extractSpreadsheetID(input)
	want := "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExtractSpreadsheetID_InvalidURLNoSpreadsheetPath(t *testing.T) {
	input := "https://example.com/some/path?q=hello"
	got := extractSpreadsheetID(input)
	if got != "" {
		t.Errorf("expected empty string for non-spreadsheet URL, got %q", got)
	}
}

func TestExtractSpreadsheetID_BareIDContainsInvalidChar(t *testing.T) {
	// Space in the middle makes it fail both regexes.
	input := "abc defghijkl"
	got := extractSpreadsheetID(input)
	if got != "" {
		t.Errorf("expected empty string for ID containing space, got %q", got)
	}
}

func TestExtractSpreadsheetID_URLPreferredOverBareID(t *testing.T) {
	// If the input is a full URL the path regex should win.
	input := "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/gviz/tq"
	got := extractSpreadsheetID(input)
	want := "SPREADSHEET_ID_HERE"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ============================================================
// parseCSV
// ============================================================

func TestParseCSV_SimpleRow(t *testing.T) {
	rows := parseCSV("a,b,c")
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"a", "b", "c"})
}

func TestParseCSV_MultipleRows_LF(t *testing.T) {
	rows := parseCSV("a,b\nc,d")
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"a", "b"})
	assertRow(t, rows[1], []string{"c", "d"})
}

func TestParseCSV_MultipleRows_CRLF(t *testing.T) {
	rows := parseCSV("a,b\r\nc,d")
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"a", "b"})
	assertRow(t, rows[1], []string{"c", "d"})
}

func TestParseCSV_QuotedFieldWithComma(t *testing.T) {
	rows := parseCSV(`"hello, world",second`)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"hello, world", "second"})
}

func TestParseCSV_QuotedFieldWithNewline(t *testing.T) {
	// A quoted field may contain an embedded newline; it must stay in one logical row.
	rows := parseCSV("\"line1\nline2\",after")
	if len(rows) != 1 {
		t.Fatalf("expected 1 row (quoted newline should not split rows), got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"line1\nline2", "after"})
}

func TestParseCSV_EscapedDoubleQuote(t *testing.T) {
	// RFC 4180: "" inside a quoted field represents a literal ".
	rows := parseCSV(`"say ""hello""",end`)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{`say "hello"`, "end"})
}

func TestParseCSV_EmptyFields(t *testing.T) {
	rows := parseCSV("a,,c")
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"a", "", "c"})
}

func TestParseCSV_EmptyString(t *testing.T) {
	rows := parseCSV("")
	if len(rows) != 0 {
		t.Fatalf("expected 0 rows for empty input, got %d", len(rows))
	}
}

func TestParseCSV_SingleField(t *testing.T) {
	rows := parseCSV("hello")
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"hello"})
}

func TestParseCSV_HeaderAndDataRows(t *testing.T) {
	csv := "period,start,end,mon,tue,wed,thu,fri\n1,9:00,9:40,수학,영어,국어,과학,체육"
	rows := parseCSV(csv)
	if len(rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(rows))
	}
	assertRow(t, rows[0], []string{"period", "start", "end", "mon", "tue", "wed", "thu", "fri"})
	assertRow(t, rows[1], []string{"1", "9:00", "9:40", "수학", "영어", "국어", "과학", "체육"})
}

func TestParseCSV_MixedCRLFAndLF(t *testing.T) {
	// CRLF on first line, LF on second.
	rows := parseCSV("a,b\r\nc,d\ne,f")
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}
}

// ============================================================
// csvToTimetableData
// ============================================================

func TestCsvToTimetableData_ValidData(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end", "mon", "tue", "wed", "thu", "fri"},
		{"1", "9:00", "9:40", "수학", "영어", "국어", "과학", "체육"},
		{"2", "9:50", "10:30", "영어", "수학", "체육", "국어", "과학"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if len(data.Periods) != 2 {
		t.Fatalf("expected 2 periods, got %d", len(data.Periods))
	}
	if data.Periods[0].Period != 1 {
		t.Errorf("expected period 1, got %d", data.Periods[0].Period)
	}
	if data.Periods[0].Start != "09:00" {
		t.Errorf("expected start 09:00, got %q", data.Periods[0].Start)
	}
	if data.Periods[0].End != "09:40" {
		t.Errorf("expected end 09:40, got %q", data.Periods[0].End)
	}
	if len(data.Subjects) != 2 {
		t.Fatalf("expected 2 subject rows, got %d", len(data.Subjects))
	}
	assertRow(t, data.Subjects[0], []string{"수학", "영어", "국어", "과학", "체육"})
}

func TestCsvToTimetableData_NormalizesHourPadding(t *testing.T) {
	// Single-digit hour (e.g., "9:00") should be normalised to "09:00".
	rows := [][]string{
		{"period", "start", "end"},
		{"1", "9:05", "9:45"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if data.Periods[0].Start != "09:05" {
		t.Errorf("expected 09:05, got %q", data.Periods[0].Start)
	}
	if data.Periods[0].End != "09:45" {
		t.Errorf("expected 09:45, got %q", data.Periods[0].End)
	}
}

func TestCsvToTimetableData_TwoDigitHourUnchanged(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"1", "10:00", "10:40"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if data.Periods[0].Start != "10:00" {
		t.Errorf("expected 10:00, got %q", data.Periods[0].Start)
	}
}

func TestCsvToTimetableData_EmptyData_ReturnsNil(t *testing.T) {
	data := csvToTimetableData([][]string{})
	if data != nil {
		t.Errorf("expected nil for empty rows, got %+v", data)
	}
}

func TestCsvToTimetableData_HeaderOnlyNoDataRows_ReturnsNil(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
	}
	data := csvToTimetableData(rows)
	if data != nil {
		t.Errorf("expected nil when no data rows, got %+v", data)
	}
}

func TestCsvToTimetableData_InvalidPeriodNumber_SkipsRow(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"abc", "09:00", "09:40"},
		{"1", "10:00", "10:40"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData after skipping bad row")
	}
	if len(data.Periods) != 1 {
		t.Fatalf("expected 1 valid period, got %d", len(data.Periods))
	}
	if data.Periods[0].Period != 1 {
		t.Errorf("expected period 1, got %d", data.Periods[0].Period)
	}
}

func TestCsvToTimetableData_AllInvalidPeriods_ReturnsNil(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"X", "09:00", "09:40"},
	}
	data := csvToTimetableData(rows)
	if data != nil {
		t.Errorf("expected nil when all rows have invalid period numbers, got %+v", data)
	}
}

func TestCsvToTimetableData_InvalidTimeFormat_SkipsRow(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"1", "9am", "10am"},   // invalid format
		{"2", "10:00", "10:40"}, // valid
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if len(data.Periods) != 1 {
		t.Fatalf("expected 1 valid period, got %d", len(data.Periods))
	}
	if data.Periods[0].Period != 2 {
		t.Errorf("expected period 2, got %d", data.Periods[0].Period)
	}
}

func TestCsvToTimetableData_InvalidTimeNoColon_SkipsRow(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"1", "0900", "0940"},
	}
	data := csvToTimetableData(rows)
	if data != nil {
		t.Errorf("expected nil for time without colon, got %+v", data)
	}
}

func TestCsvToTimetableData_FewerThanFiveDayColumns_PaddedWithEmpty(t *testing.T) {
	// Only 2 day columns provided; remaining 3 should be empty strings.
	rows := [][]string{
		{"period", "start", "end", "mon", "tue"},
		{"1", "09:00", "09:40", "수학", "영어"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	subjects := data.Subjects[0]
	if len(subjects) != 5 {
		t.Fatalf("expected 5 subject slots, got %d", len(subjects))
	}
	if subjects[0] != "수학" || subjects[1] != "영어" {
		t.Errorf("unexpected subjects: %v", subjects)
	}
	if subjects[2] != "" || subjects[3] != "" || subjects[4] != "" {
		t.Errorf("expected empty strings for missing day columns, got %v", subjects[2:])
	}
}

func TestCsvToTimetableData_RowTooShort_Skipped(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{"1", "09:00"}, // only 2 columns – must be skipped
		{"2", "10:00", "10:40"},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if len(data.Periods) != 1 || data.Periods[0].Period != 2 {
		t.Errorf("expected only period 2, got %+v", data.Periods)
	}
}

func TestCsvToTimetableData_WhitespaceInFields_Trimmed(t *testing.T) {
	rows := [][]string{
		{"period", "start", "end"},
		{" 3 ", " 11:00 ", " 11:40 "},
	}
	data := csvToTimetableData(rows)
	if data == nil {
		t.Fatal("expected non-nil TimetableData")
	}
	if data.Periods[0].Period != 3 {
		t.Errorf("expected period 3, got %d", data.Periods[0].Period)
	}
	if data.Periods[0].Start != "11:00" {
		t.Errorf("expected start 11:00, got %q", data.Periods[0].Start)
	}
}

// ============================================================
// parseDateToYYYYMMDD
// ============================================================

func TestParseDateToYYYYMMDD_HyphenSeparator(t *testing.T) {
	got := parseDateToYYYYMMDD("2026-03-15")
	want := "20260315"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_DotSeparator(t *testing.T) {
	got := parseDateToYYYYMMDD("2026.03.15")
	want := "20260315"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_SlashSeparator(t *testing.T) {
	got := parseDateToYYYYMMDD("2026/03/15")
	want := "20260315"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_SingleDigitMonth(t *testing.T) {
	got := parseDateToYYYYMMDD("2026-3-5")
	want := "20260305"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_SingleDigitDay(t *testing.T) {
	got := parseDateToYYYYMMDD("2026-03-5")
	want := "20260305"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_SingleDigitMonthAndDay(t *testing.T) {
	got := parseDateToYYYYMMDD("2026-1-1")
	want := "20260101"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_EightDigitCompact(t *testing.T) {
	got := parseDateToYYYYMMDD("20260315")
	want := "20260315"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestParseDateToYYYYMMDD_EmptyString(t *testing.T) {
	got := parseDateToYYYYMMDD("")
	if got != "" {
		t.Errorf("expected empty string for empty input, got %q", got)
	}
}

func TestParseDateToYYYYMMDD_InvalidFormat(t *testing.T) {
	cases := []string{
		"March 15, 2026",
		"15-03-2026",
		"2026",
		"abcdefgh",
		"2026/3",
	}
	for _, c := range cases {
		got := parseDateToYYYYMMDD(c)
		if got != "" {
			t.Errorf("input %q: expected empty string, got %q", c, got)
		}
	}
}

func TestParseDateToYYYYMMDD_MixedSeparatorsMatchedByRegex(t *testing.T) {
	// The regex uses [-./] so mixing separators is technically matched.
	// e.g. "2026-03.15" – the regex allows any of those separators independently.
	got := parseDateToYYYYMMDD("2026-03.15")
	want := "20260315"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ============================================================
// csvToEvents
// ============================================================

// makeEventRows builds a CSV row slice with a header and the provided data rows.
// date and name are always required; detail is optional (pass "" to omit).
func makeEventRows(entries []struct{ date, name, detail string }) [][]string {
	rows := [][]string{{"date", "name", "detail"}}
	for _, e := range entries {
		if e.detail != "" {
			rows = append(rows, []string{e.date, e.name, e.detail})
		} else {
			rows = append(rows, []string{e.date, e.name})
		}
	}
	return rows
}

// testTodayPlusMonths returns a date string in YYYY-MM-DD form that is `months`
// calendar months after today (used to construct test dates relative to now).
func testTodayPlusMonths(months int) string {
	t := time.Now().AddDate(0, months, 0)
	return fmt.Sprintf("%04d-%02d-%02d", t.Year(), t.Month(), t.Day())
}

// testTodayDash returns today's date as YYYY-MM-DD.
func testTodayDash() string {
	n := time.Now()
	return fmt.Sprintf("%04d-%02d-%02d", n.Year(), n.Month(), n.Day())
}

// testYesterdayDash returns yesterday's date as YYYY-MM-DD.
func testYesterdayDash() string {
	n := time.Now().AddDate(0, 0, -1)
	return fmt.Sprintf("%04d-%02d-%02d", n.Year(), n.Month(), n.Day())
}

func TestCsvToEvents_ValidFutureEvent(t *testing.T) {
	rows := makeEventRows([]struct{ date, name, detail string }{
		{testTodayDash(), "개학식", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Name != "개학식" {
		t.Errorf("expected name 개학식, got %q", events[0].Name)
	}
}

func TestCsvToEvents_EventWithDetail(t *testing.T) {
	rows := makeEventRows([]struct{ date, name, detail string }{
		{testTodayDash(), "소풍", "1학년 전체"},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Detail != "1학년 전체" {
		t.Errorf("expected detail '1학년 전체', got %q", events[0].Detail)
	}
}

func TestCsvToEvents_PastEventExcluded(t *testing.T) {
	rows := makeEventRows([]struct{ date, name, detail string }{
		{testYesterdayDash(), "과거행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events (past date filtered out), got %d: %+v", len(events), events)
	}
}

func TestCsvToEvents_EventBeyondTwoMonthsExcluded(t *testing.T) {
	// A date 3 months from now must be filtered out (cutoff is today+2 months).
	farFuture := testTodayPlusMonths(3)
	rows := makeEventRows([]struct{ date, name, detail string }{
		{farFuture, "먼미래행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events (beyond cutoff), got %d", len(events))
	}
}

func TestCsvToEvents_EventAtCutoffBoundary(t *testing.T) {
	// Exactly at today+2 months should be included (After check is exclusive).
	atCutoff := testTodayPlusMonths(2)
	rows := makeEventRows([]struct{ date, name, detail string }{
		{atCutoff, "마감행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Errorf("expected 1 event at cutoff boundary, got %d", len(events))
	}
}

func TestCsvToEvents_DateFormatDot(t *testing.T) {
	date := testTodayDash()
	// Convert YYYY-MM-DD -> YYYY.MM.DD
	dotDate := date[:4] + "." + date[5:7] + "." + date[8:10]
	rows := makeEventRows([]struct{ date, name, detail string }{
		{dotDate, "점행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Errorf("expected 1 event with dot-separated date, got %d", len(events))
	}
}

func TestCsvToEvents_DateFormatSlash(t *testing.T) {
	date := testTodayDash()
	slashDate := date[:4] + "/" + date[5:7] + "/" + date[8:10]
	rows := makeEventRows([]struct{ date, name, detail string }{
		{slashDate, "슬래시행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Errorf("expected 1 event with slash-separated date, got %d", len(events))
	}
}

func TestCsvToEvents_DateFormatCompact(t *testing.T) {
	date := testTodayDash()
	compact := date[:4] + date[5:7] + date[8:10]
	rows := makeEventRows([]struct{ date, name, detail string }{
		{compact, "숫자행사", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Errorf("expected 1 event with compact YYYYMMDD date, got %d", len(events))
	}
}

func TestCsvToEvents_EmptyRowsReturnNil(t *testing.T) {
	events := csvToEvents([][]string{})
	if events != nil {
		t.Errorf("expected nil for empty rows, got %+v", events)
	}
}

func TestCsvToEvents_HeaderOnlyReturnsNil(t *testing.T) {
	rows := [][]string{{"date", "name"}}
	events := csvToEvents(rows)
	if events != nil {
		t.Errorf("expected nil for header-only input, got %+v", events)
	}
}

func TestCsvToEvents_MissingDate_RowSkipped(t *testing.T) {
	rows := [][]string{
		{"date", "name"},
		{"", "이름없는날짜"},
	}
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events when date is empty, got %d", len(events))
	}
}

func TestCsvToEvents_MissingName_RowSkipped(t *testing.T) {
	rows := [][]string{
		{"date", "name"},
		{testTodayDash(), ""},
	}
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events when name is empty, got %d", len(events))
	}
}

func TestCsvToEvents_InvalidDateFormat_RowSkipped(t *testing.T) {
	rows := [][]string{
		{"date", "name"},
		{"오늘", "잘못된날짜행사"},
	}
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events for unparseable date, got %d", len(events))
	}
}

func TestCsvToEvents_RowTooShort_Skipped(t *testing.T) {
	// A row with only one column must be skipped (need at least date + name).
	rows := [][]string{
		{"date", "name"},
		{testTodayDash()},
	}
	events := csvToEvents(rows)
	if len(events) != 0 {
		t.Errorf("expected 0 events for single-column row, got %d", len(events))
	}
}

func TestCsvToEvents_DateStoredAsYYYYMMDD(t *testing.T) {
	date := testTodayDash()
	// Input is YYYY-MM-DD; stored Date field should be YYYYMMDD (no separators).
	rows := makeEventRows([]struct{ date, name, detail string }{
		{date, "날짜형식확인", ""},
	})
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	compact := date[:4] + date[5:7] + date[8:10]
	if events[0].Date != compact {
		t.Errorf("expected Date field %q, got %q", compact, events[0].Date)
	}
}

func TestCsvToEvents_MultipleEvents_OnlyValidIncluded(t *testing.T) {
	today := testTodayDash()
	yesterday := testYesterdayDash()
	farFuture := testTodayPlusMonths(3)

	rows := [][]string{
		{"date", "name"},
		{today, "오늘행사"},
		{yesterday, "과거행사"},
		{farFuture, "먼미래행사"},
		{"invalid", "잘못된날짜"},
	}
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 valid event, got %d: %+v", len(events), events)
	}
	if events[0].Name != "오늘행사" {
		t.Errorf("expected 오늘행사, got %q", events[0].Name)
	}
}

func TestCsvToEvents_WhitespaceInFieldsTrimmed(t *testing.T) {
	date := testTodayDash()
	rows := [][]string{
		{"date", "name"},
		{" " + date + " ", "  공백테스트  "},
	}
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Name != "공백테스트" {
		t.Errorf("expected trimmed name '공백테스트', got %q", events[0].Name)
	}
}

func TestCsvToEvents_EmptyDetailOmitted(t *testing.T) {
	rows := [][]string{
		{"date", "name", "detail"},
		{testTodayDash(), "세부없음", ""},
	}
	events := csvToEvents(rows)
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Detail != "" {
		t.Errorf("expected empty Detail, got %q", events[0].Detail)
	}
}

// ============================================================
// Helper
// ============================================================

func assertRow(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("row length: got %d, want %d  (got=%v, want=%v)", len(got), len(want), got, want)
		return
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("col[%d]: got %q, want %q", i, got[i], want[i])
		}
	}
}
