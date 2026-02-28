package main

import (
	"fmt"
	"testing"
)

// makeEvent is a helper that constructs a ScheduleEvent for use in tests.
func makeEvent(date, name, detail string) ScheduleEvent {
	return ScheduleEvent{Date: date, Name: name, Detail: detail}
}

// --- mergeEvents: basic merge ---

func TestMergeEvents_NeisAndSheetCombined(t *testing.T) {
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", ""),
		makeEvent("20260315", "학부모 상담", ""),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260310", "현장 학습", "비봉산"),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 3 {
		t.Fatalf("expected 3 events, got %d", len(got))
	}
}

// --- mergeEvents: deduplication by date+name key ---

func TestMergeEvents_DeduplicatesByDateAndName(t *testing.T) {
	// The same date+name appears in both sources; only one copy should survive.
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "NEIS detail"),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "Sheet detail"),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 1 {
		t.Fatalf("expected 1 event after dedup, got %d", len(got))
	}
	// The NEIS event is appended first, so it should be the survivor.
	if got[0].Detail != "NEIS detail" {
		t.Errorf("expected surviving event to have detail %q, got %q", "NEIS detail", got[0].Detail)
	}
}

func TestMergeEvents_SameDateDifferentNameNotDeduplicated(t *testing.T) {
	// Same date but different names must both survive.
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", ""),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260301", "체험 학습", ""),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 2 {
		t.Fatalf("expected 2 events (different names), got %d", len(got))
	}
}

func TestMergeEvents_SameNameDifferentDateNotDeduplicated(t *testing.T) {
	// Same name but different dates must both survive.
	neis := []ScheduleEvent{
		makeEvent("20260301", "회의", ""),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260401", "회의", ""),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 2 {
		t.Fatalf("expected 2 events (different dates), got %d", len(got))
	}
}

// --- mergeEvents: sort order ---

func TestMergeEvents_SortedByDateAscending(t *testing.T) {
	// Provide events in reverse chronological order; result must be ascending.
	neis := []ScheduleEvent{
		makeEvent("20260501", "어린이날", ""),
		makeEvent("20260301", "삼일절", ""),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260401", "봄 소풍", ""),
	}

	got := mergeEvents(neis, sheet)

	expected := []string{"20260301", "20260401", "20260501"}
	for i, e := range got {
		if e.Date != expected[i] {
			t.Errorf("position %d: expected date %s, got %s", i, expected[i], e.Date)
		}
	}
}

func TestMergeEvents_AlreadySortedInputRemainsCorrect(t *testing.T) {
	neis := []ScheduleEvent{
		makeEvent("20260101", "신정", ""),
		makeEvent("20260201", "설날", ""),
	}
	sheet := []ScheduleEvent{}

	got := mergeEvents(neis, sheet)

	if got[0].Date != "20260101" || got[1].Date != "20260201" {
		t.Errorf("expected dates [20260101, 20260201], got [%s, %s]", got[0].Date, got[1].Date)
	}
}

// --- mergeEvents: 30-event limit ---

func TestMergeEvents_LimitOf30Events(t *testing.T) {
	// Build 40 unique events spread across neis and sheet.
	var neis []ScheduleEvent
	for i := 0; i < 25; i++ {
		neis = append(neis, makeEvent(fmt.Sprintf("202603%02d", i+1), fmt.Sprintf("행사%d", i), ""))
	}
	var sheet []ScheduleEvent
	for i := 25; i < 40; i++ {
		sheet = append(sheet, makeEvent(fmt.Sprintf("202604%02d", i-24), fmt.Sprintf("행사%d", i), ""))
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 30 {
		t.Fatalf("expected exactly 30 events (limit), got %d", len(got))
	}
}

func TestMergeEvents_ExactlyThirtyEventsNoTruncation(t *testing.T) {
	var neis []ScheduleEvent
	for i := 0; i < 30; i++ {
		neis = append(neis, makeEvent(fmt.Sprintf("202603%02d", i+1), fmt.Sprintf("행사%d", i), ""))
	}

	got := mergeEvents(neis, nil)

	if len(got) != 30 {
		t.Fatalf("expected 30 events with no truncation, got %d", len(got))
	}
}

func TestMergeEvents_LimitKeepsEarliestDates(t *testing.T) {
	// 35 events: dates "20260101" through "20260135" (synthetic).
	// After sorting and truncating, only the first 30 (earliest) should remain.
	var neis []ScheduleEvent
	for i := 0; i < 35; i++ {
		// Use month 01-12 range safely with a year-spanning approach.
		date := fmt.Sprintf("2026%02d01", i+1) // 202601 .. 202635 — safe as string keys
		neis = append(neis, makeEvent(date, fmt.Sprintf("행사%d", i), ""))
	}

	got := mergeEvents(neis, nil)

	if len(got) != 30 {
		t.Fatalf("expected 30 events, got %d", len(got))
	}
	// The 30th entry must be earlier than what would have been the 31st.
	// Dates are lexicographically sortable, so got[29] < neis[30].Date (after sort).
	if got[29].Date >= neis[30].Date {
		t.Errorf("limit did not retain the earliest 30 dates: last kept=%s, first dropped=%s",
			got[29].Date, neis[30].Date)
	}
}

// --- mergeEvents: empty inputs ---

func TestMergeEvents_BothEmpty(t *testing.T) {
	got := mergeEvents(nil, nil)

	// nil or empty slice — both are acceptable; length must be 0.
	if len(got) != 0 {
		t.Fatalf("expected 0 events for empty inputs, got %d", len(got))
	}
}

func TestMergeEvents_OnlyNeisEmpty(t *testing.T) {
	sheet := []ScheduleEvent{
		makeEvent("20260310", "현장 학습", ""),
	}

	got := mergeEvents(nil, sheet)

	if len(got) != 1 {
		t.Fatalf("expected 1 event, got %d", len(got))
	}
	if got[0].Name != "현장 학습" {
		t.Errorf("expected event name %q, got %q", "현장 학습", got[0].Name)
	}
}

func TestMergeEvents_OnlySheetEmpty(t *testing.T) {
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", ""),
	}

	got := mergeEvents(neis, nil)

	if len(got) != 1 {
		t.Fatalf("expected 1 event, got %d", len(got))
	}
	if got[0].Name != "삼일절" {
		t.Errorf("expected event name %q, got %q", "삼일절", got[0].Name)
	}
}

func TestMergeEvents_EmptySlicesVsNil(t *testing.T) {
	// Explicit empty slices must behave identically to nil.
	got := mergeEvents([]ScheduleEvent{}, []ScheduleEvent{})

	if len(got) != 0 {
		t.Fatalf("expected 0 events for empty slice inputs, got %d", len(got))
	}
}

// --- mergeEvents: all duplicates ---

func TestMergeEvents_AllDuplicates_SingleEvent(t *testing.T) {
	e := makeEvent("20260301", "삼일절", "")
	neis := []ScheduleEvent{e, e, e}
	sheet := []ScheduleEvent{e, e}

	got := mergeEvents(neis, sheet)

	if len(got) != 1 {
		t.Fatalf("expected 1 unique event, got %d", len(got))
	}
}

func TestMergeEvents_AllDuplicates_MultipleEvents(t *testing.T) {
	// Two distinct events, each repeated across both sources.
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "n"),
		makeEvent("20260505", "어린이날", "n"),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "s"),
		makeEvent("20260505", "어린이날", "s"),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 2 {
		t.Fatalf("expected 2 unique events, got %d", len(got))
	}
}

// --- mergeEvents: mix of duplicates and unique events ---

func TestMergeEvents_MixDuplicateAndUnique(t *testing.T) {
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", ""),       // will be duplicated
		makeEvent("20260315", "학부모 상담", ""),    // unique to NEIS
	}
	sheet := []ScheduleEvent{
		makeEvent("20260301", "삼일절", ""),       // duplicate of neis[0]
		makeEvent("20260320", "졸업식", ""),       // unique to sheet
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 3 {
		t.Fatalf("expected 3 events (1 deduped + 1 NEIS-only + 1 sheet-only), got %d", len(got))
	}

	// Verify the three expected events are present (order is date-ascending).
	wantDates := []string{"20260301", "20260315", "20260320"}
	wantNames := []string{"삼일절", "학부모 상담", "졸업식"}
	for i := range got {
		if got[i].Date != wantDates[i] {
			t.Errorf("position %d: expected date %s, got %s", i, wantDates[i], got[i].Date)
		}
		if got[i].Name != wantNames[i] {
			t.Errorf("position %d: expected name %s, got %s", i, wantNames[i], got[i].Name)
		}
	}
}

func TestMergeEvents_MixPreservesDetailFromFirstSeen(t *testing.T) {
	// The NEIS entry is appended before the sheet entry, so its Detail wins.
	neis := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "NEIS only"),
	}
	sheet := []ScheduleEvent{
		makeEvent("20260301", "삼일절", "Sheet override"),
		makeEvent("20260401", "봄 소풍", "Sheet unique"),
	}

	got := mergeEvents(neis, sheet)

	if len(got) != 2 {
		t.Fatalf("expected 2 events, got %d", len(got))
	}
	if got[0].Detail != "NEIS only" {
		t.Errorf("expected NEIS detail to survive dedup, got %q", got[0].Detail)
	}
	if got[1].Name != "봄 소풍" {
		t.Errorf("expected sheet-unique event at index 1, got %q", got[1].Name)
	}
}

func TestMergeEvents_MixWithLargeInput(t *testing.T) {
	// 20 unique NEIS + 20 unique sheet + 5 shared = 40 unique - 5 dedup = 35 unique,
	// which exceeds 30, so result must be capped.
	var neis []ScheduleEvent
	for i := 0; i < 20; i++ {
		neis = append(neis, makeEvent(fmt.Sprintf("202601%02d", i+1), fmt.Sprintf("NEIS행사%d", i), ""))
	}
	// 5 events duplicated across both
	shared := []ScheduleEvent{
		makeEvent("20260201", "공유행사1", ""),
		makeEvent("20260202", "공유행사2", ""),
		makeEvent("20260203", "공유행사3", ""),
		makeEvent("20260204", "공유행사4", ""),
		makeEvent("20260205", "공유행사5", ""),
	}
	neis = append(neis, shared...)

	var sheet []ScheduleEvent
	for i := 0; i < 20; i++ {
		sheet = append(sheet, makeEvent(fmt.Sprintf("202603%02d", i+1), fmt.Sprintf("Sheet행사%d", i), ""))
	}
	sheet = append(sheet, shared...) // add duplicates

	got := mergeEvents(neis, sheet)

	if len(got) != 30 {
		t.Fatalf("expected 30 events (capped), got %d", len(got))
	}

	// Verify ascending date order is maintained.
	for i := 1; i < len(got); i++ {
		if got[i].Date < got[i-1].Date {
			t.Errorf("events not sorted: got[%d].Date=%s < got[%d].Date=%s",
				i, got[i].Date, i-1, got[i-1].Date)
		}
	}
}
