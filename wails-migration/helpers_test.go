package main

import (
	"fmt"
	"regexp"
	"testing"
	"time"
)

// yyyymmdd is the canonical regular expression for YYYYMMDD date strings.
var yyyymmdd = regexp.MustCompile(`^\d{8}$`)

// parseYYYYMMDD parses a YYYYMMDD string into a time.Time (date only).
// It fails the test immediately if the string is malformed.
func parseYYYYMMDD(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.ParseInLocation("20060102", s, time.Local)
	if err != nil {
		t.Fatalf("parseYYYYMMDD(%q): %v", s, err)
	}
	return tm
}

// --- todayStr ---

// TestTodayStr_Format verifies the returned string is exactly 8 digits.
func TestTodayStr_Format(t *testing.T) {
	result := todayStr()
	if !yyyymmdd.MatchString(result) {
		t.Errorf("todayStr() = %q, want 8-digit YYYYMMDD string", result)
	}
}

// TestTodayStr_MatchesCurrentDate verifies the value equals today's date.
// The test captures time.Now() just before calling todayStr so that both sides
// of the comparison share the same calendar day even when run at midnight.
func TestTodayStr_MatchesCurrentDate(t *testing.T) {
	now := time.Now()
	result := todayStr()

	expected := fmt.Sprintf("%04d%02d%02d", now.Year(), int(now.Month()), now.Day())
	if result != expected {
		// Allow a one-day drift in case the test straddles midnight.
		tomorrow := now.AddDate(0, 0, 1)
		altExpected := fmt.Sprintf("%04d%02d%02d", tomorrow.Year(), int(tomorrow.Month()), tomorrow.Day())
		if result != altExpected {
			t.Errorf("todayStr() = %q, want %q (or %q near midnight)", result, expected, altExpected)
		}
	}
}

// TestTodayStr_YearRange sanity-checks that the embedded year is plausible
// (between 2020 and 2100).
func TestTodayStr_YearRange(t *testing.T) {
	result := todayStr()
	tm := parseYYYYMMDD(t, result)
	year := tm.Year()
	if year < 2020 || year > 2100 {
		t.Errorf("todayStr() year %d is outside expected range [2020, 2100]", year)
	}
}

// --- dateAfterDays ---

// TestDateAfterDays_Format verifies the returned string is exactly 8 digits.
func TestDateAfterDays_Format(t *testing.T) {
	for _, days := range []int{-30, -1, 0, 1, 30, 365} {
		result := dateAfterDays(days)
		if !yyyymmdd.MatchString(result) {
			t.Errorf("dateAfterDays(%d) = %q, want 8-digit YYYYMMDD string", days, result)
		}
	}
}

// TestDateAfterDays_Zero verifies that 0 days returns today's date (same as
// todayStr).
func TestDateAfterDays_Zero(t *testing.T) {
	today := todayStr()
	result := dateAfterDays(0)
	if result != today {
		t.Errorf("dateAfterDays(0) = %q, want %q (today)", result, today)
	}
}

// TestDateAfterDays_PositiveOffset verifies a known forward offset.
// We use the actual date arithmetic so the test is not calendar-dependent.
func TestDateAfterDays_PositiveOffset(t *testing.T) {
	now := time.Now()
	for _, days := range []int{1, 7, 14, 30, 100, 365} {
		expected := now.AddDate(0, 0, days)
		want := fmt.Sprintf("%04d%02d%02d", expected.Year(), int(expected.Month()), expected.Day())
		got := dateAfterDays(days)
		if got != want {
			t.Errorf("dateAfterDays(%d) = %q, want %q", days, got, want)
		}
	}
}

// TestDateAfterDays_NegativeOffset verifies past dates.
func TestDateAfterDays_NegativeOffset(t *testing.T) {
	now := time.Now()
	for _, days := range []int{-1, -7, -30, -365} {
		expected := now.AddDate(0, 0, days)
		want := fmt.Sprintf("%04d%02d%02d", expected.Year(), int(expected.Month()), expected.Day())
		got := dateAfterDays(days)
		if got != want {
			t.Errorf("dateAfterDays(%d) = %q, want %q", days, got, want)
		}
	}
}

// TestDateAfterDays_MidnightStability verifies that dateAfterDays(1) is
// always strictly later than dateAfterDays(0).
func TestDateAfterDays_MidnightStability(t *testing.T) {
	d0 := parseYYYYMMDD(t, dateAfterDays(0))
	d1 := parseYYYYMMDD(t, dateAfterDays(1))
	if !d1.After(d0) {
		t.Errorf("dateAfterDays(1) (%s) is not after dateAfterDays(0) (%s)", d1.Format("20060102"), d0.Format("20060102"))
	}
}

// TestDateAfterDays_Ordering verifies that dateAfterDays(n) < dateAfterDays(n+1)
// for a sample of offsets.
func TestDateAfterDays_Ordering(t *testing.T) {
	offsets := []int{-5, 0, 5, 10, 100}
	for i := 0; i < len(offsets)-1; i++ {
		a := parseYYYYMMDD(t, dateAfterDays(offsets[i]))
		b := parseYYYYMMDD(t, dateAfterDays(offsets[i+1]))
		if !a.Before(b) {
			t.Errorf(
				"dateAfterDays(%d) = %s is not before dateAfterDays(%d) = %s",
				offsets[i], a.Format("20060102"),
				offsets[i+1], b.Format("20060102"),
			)
		}
	}
}

// --- endOfMonthPlus2 ---

// TestEndOfMonthPlus2_Format verifies the returned string is exactly 8 digits.
func TestEndOfMonthPlus2_Format(t *testing.T) {
	result := endOfMonthPlus2()
	if !yyyymmdd.MatchString(result) {
		t.Errorf("endOfMonthPlus2() = %q, want 8-digit YYYYMMDD string", result)
	}
}

// TestEndOfMonthPlus2_IsLastDayOfMonthPlus2 verifies the core invariant:
// the returned date is the last day of (current month + 2).
//
// The implementation uses time.Date(year, month+3, 0, ...) which is Go's
// idiom for "day 0 of month+3" == "last day of month+2".
func TestEndOfMonthPlus2_IsLastDayOfMonthPlus2(t *testing.T) {
	now := time.Now()
	result := endOfMonthPlus2()
	got := parseYYYYMMDD(t, result)

	// Compute the expected last day of (now.Month + 2) independently.
	targetMonth := now.Month() + 2
	targetYear := now.Year()
	// Normalise month overflow (e.g. November+2 = January next year).
	for targetMonth > 12 {
		targetMonth -= 12
		targetYear++
	}
	// "Day 0 of the month after targetMonth" == last day of targetMonth.
	lastDay := time.Date(targetYear, targetMonth+1, 0, 0, 0, 0, 0, time.Local)

	if !got.Equal(lastDay) {
		t.Errorf(
			"endOfMonthPlus2() = %s, want last day of month+2 = %s (for current month %s)",
			got.Format("20060102"),
			lastDay.Format("20060102"),
			now.Month().String(),
		)
	}
}

// TestEndOfMonthPlus2_IsInFuture verifies that the result is always in the
// future (at least in the same month or later), i.e. >= today.
func TestEndOfMonthPlus2_IsInFuture(t *testing.T) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	result := parseYYYYMMDD(t, endOfMonthPlus2())

	if result.Before(today) {
		t.Errorf(
			"endOfMonthPlus2() = %s is before today %s; expected future or same month",
			result.Format("20060102"),
			today.Format("20060102"),
		)
	}
}

// TestEndOfMonthPlus2_DayIsLastOfMonth verifies that adding one day to the
// result always crosses into the next month, i.e. the result is truly the
// final day of its month.
func TestEndOfMonthPlus2_DayIsLastOfMonth(t *testing.T) {
	result := parseYYYYMMDD(t, endOfMonthPlus2())
	nextDay := result.AddDate(0, 0, 1)

	if nextDay.Month() == result.Month() && nextDay.Year() == result.Year() {
		t.Errorf(
			"endOfMonthPlus2() = %s is not the last day of its month (next day %s is in the same month)",
			result.Format("20060102"),
			nextDay.Format("20060102"),
		)
	}
}

// TestEndOfMonthPlus2_KnownMonths exercises a table of concrete months to
// guard against off-by-one errors in the month+3/day-0 arithmetic.
// Each sub-test overrides time.Now by computing the expected result directly
// from a fixed reference date using the same formula as the production code,
// then confirms the formula is self-consistent.
func TestEndOfMonthPlus2_KnownMonths(t *testing.T) {
	cases := []struct {
		name      string
		ref       time.Time
		wantMonth time.Month // last day of this month
		wantYear  int
	}{
		{
			name:      "January_plus2_is_March",
			ref:       time.Date(2026, time.January, 15, 0, 0, 0, 0, time.Local),
			wantMonth: time.March,
			wantYear:  2026,
		},
		{
			name:      "October_plus2_is_December",
			ref:       time.Date(2026, time.October, 1, 0, 0, 0, 0, time.Local),
			wantMonth: time.December,
			wantYear:  2026,
		},
		{
			name:      "November_plus2_is_January_next_year",
			ref:       time.Date(2026, time.November, 30, 0, 0, 0, 0, time.Local),
			wantMonth: time.January,
			wantYear:  2027,
		},
		{
			name:      "December_plus2_is_February_next_year",
			ref:       time.Date(2026, time.December, 1, 0, 0, 0, 0, time.Local),
			wantMonth: time.February,
			wantYear:  2027,
		},
		{
			name:      "February_in_leap_year_plus2_is_April",
			ref:       time.Date(2024, time.February, 29, 0, 0, 0, 0, time.Local),
			wantMonth: time.April,
			wantYear:  2024,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Replicate the production formula against the fixed reference.
			computed := time.Date(tc.ref.Year(), tc.ref.Month()+3, 0, 0, 0, 0, 0, time.Local)

			if computed.Month() != tc.wantMonth || computed.Year() != tc.wantYear {
				t.Errorf(
					"for ref %s: formula gives %s (%s %d), want last day of %s %d",
					tc.ref.Format("20060102"),
					computed.Format("20060102"),
					computed.Month(), computed.Year(),
					tc.wantMonth, tc.wantYear,
				)
			}

			// Also confirm it is the last day of wantMonth.
			nextDay := computed.AddDate(0, 0, 1)
			if nextDay.Month() == computed.Month() {
				t.Errorf(
					"computed %s is not the last day of %s %d",
					computed.Format("20060102"),
					tc.wantMonth, tc.wantYear,
				)
			}
		})
	}
}
