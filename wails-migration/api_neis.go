package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type MealData struct {
	Date     string   `json:"date"`
	Menu     []string `json:"menu"`
	Calories string   `json:"calories,omitempty"`
}

type SchoolInfo struct {
	SchoolCode string `json:"schoolCode"`
	OfficeCode string `json:"officeCode"`
	SchoolName string `json:"schoolName"`
	Address    string `json:"address,omitempty"`
}

type ScheduleEvent struct {
	Date   string `json:"date"`
	Name   string `json:"name"`
	Detail string `json:"detail,omitempty"`
}

func fetchMeals(apiKey, officeCode, schoolCode, fromDate, toDate string) ([]MealData, error) {
	u := fmt.Sprintf(
		"https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=%s&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&MLSV_FROM_YMD=%s&MLSV_TO_YMD=%s&Type=json",
		apiKey, officeCode, schoolCode, fromDate, toDate,
	)

	resp, err := http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("급식 네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	var raw struct {
		MealServiceDietInfo []json.RawMessage `json:"mealServiceDietInfo"`
		Result              *struct {
			Code    string `json:"CODE"`
			Message string `json:"MESSAGE"`
		} `json:"RESULT"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("급식 응답 파싱 오류: %w", err)
	}

	if raw.Result != nil {
		if raw.Result.Code == "INFO-200" {
			return nil, nil
		}
		return nil, fmt.Errorf("급식 NEIS API 오류 (%s): %s", raw.Result.Code, raw.Result.Message)
	}

	if len(raw.MealServiceDietInfo) < 2 {
		return nil, nil
	}

	var rowData struct {
		Row []struct {
			MLSV_YMD string `json:"MLSV_YMD"`
			DDISH_NM string `json:"DDISH_NM"`
			CAL_INFO string `json:"CAL_INFO"`
		} `json:"row"`
	}
	if err := json.Unmarshal(raw.MealServiceDietInfo[1], &rowData); err != nil {
		return nil, err
	}

	var meals []MealData
	for _, row := range rowData.Row {
		menuItems := strings.Split(row.DDISH_NM, "<br/>")
		var menu []string
		for _, item := range menuItems {
			item = strings.TrimSpace(item)
			if item != "" {
				menu = append(menu, item)
			}
		}
		meals = append(meals, MealData{
			Date:     row.MLSV_YMD,
			Menu:     menu,
			Calories: row.CAL_INFO,
		})
	}

	return meals, nil
}

func searchSchool(apiKey, schoolName string) ([]SchoolInfo, error) {
	u := fmt.Sprintf(
		"https://open.neis.go.kr/hub/schoolInfo?KEY=%s&SCHUL_NM=%s&Type=json",
		apiKey, url.QueryEscape(schoolName),
	)

	resp, err := http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	var raw struct {
		SchoolInfo []json.RawMessage `json:"schoolInfo"`
		Result     *struct {
			Code    string `json:"CODE"`
			Message string `json:"MESSAGE"`
		} `json:"RESULT"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("응답 파싱 오류: %w", err)
	}

	// NEIS API error response (rate limit, invalid key, etc.)
	if raw.Result != nil {
		if raw.Result.Code == "INFO-200" {
			return nil, nil
		}
		return nil, fmt.Errorf("NEIS API 오류 (%s): %s", raw.Result.Code, raw.Result.Message)
	}

	if len(raw.SchoolInfo) < 2 {
		return nil, nil
	}

	var rowData struct {
		Row []struct {
			SD_SCHUL_CODE      string `json:"SD_SCHUL_CODE"`
			ATPT_OFCDC_SC_CODE string `json:"ATPT_OFCDC_SC_CODE"`
			SCHUL_NM           string `json:"SCHUL_NM"`
			ORG_RDNMA          string `json:"ORG_RDNMA"`
		} `json:"row"`
	}
	if err := json.Unmarshal(raw.SchoolInfo[1], &rowData); err != nil {
		return nil, fmt.Errorf("데이터 파싱 오류: %w", err)
	}

	var results []SchoolInfo
	for _, row := range rowData.Row {
		results = append(results, SchoolInfo{
			SchoolCode: row.SD_SCHUL_CODE,
			OfficeCode: row.ATPT_OFCDC_SC_CODE,
			SchoolName: row.SCHUL_NM,
			Address:    row.ORG_RDNMA,
		})
	}

	return results, nil
}

func fetchSchoolEvents(apiKey, officeCode, schoolCode, fromDate, toDate string) ([]ScheduleEvent, error) {
	u := fmt.Sprintf(
		"https://open.neis.go.kr/hub/SchoolSchedule?KEY=%s&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&AA_FROM_YMD=%s&AA_TO_YMD=%s&Type=json",
		apiKey, officeCode, schoolCode, fromDate, toDate,
	)

	resp, err := http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("행사 네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	var raw struct {
		SchoolSchedule []json.RawMessage `json:"SchoolSchedule"`
		Result         *struct {
			Code    string `json:"CODE"`
			Message string `json:"MESSAGE"`
		} `json:"RESULT"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("행사 응답 파싱 오류: %w", err)
	}

	if raw.Result != nil {
		if raw.Result.Code == "INFO-200" {
			return nil, nil
		}
		return nil, fmt.Errorf("행사 NEIS API 오류 (%s): %s", raw.Result.Code, raw.Result.Message)
	}

	if len(raw.SchoolSchedule) < 2 {
		return nil, nil
	}

	var rowData struct {
		Row []struct {
			AA_YMD      string `json:"AA_YMD"`
			EVENT_NM    string `json:"EVENT_NM"`
			EVENT_CNTNT string `json:"EVENT_CNTNT"`
		} `json:"row"`
	}
	if err := json.Unmarshal(raw.SchoolSchedule[1], &rowData); err != nil {
		return nil, err
	}

	var events []ScheduleEvent
	for _, row := range rowData.Row {
		events = append(events, ScheduleEvent{
			Date:   row.AA_YMD,
			Name:   row.EVENT_NM,
			Detail: row.EVENT_CNTNT,
		})
	}

	return events, nil
}

// ===== NEIS Timetable =====

func getThisWeekDays() ([]time.Time, string, string) {
	now := time.Now()
	wd := int(now.Weekday())
	if wd == 0 {
		wd = 7
	}
	// Monday is 1, Sunday is 7. Offset to Monday: 1 - wd
	offset := 1 - wd
	monday := now.AddDate(0, 0, offset)

	var days []time.Time
	for i := 0; i < 5; i++ {
		days = append(days, monday.AddDate(0, 0, i))
	}

	from := days[0].Format("20060102")
	to := days[4].Format("20060102")
	return days, from, to
}

func getDefaultPeriods(schoolName string, count int) []PeriodTime {
	var p []PeriodTime
	classMin := 50
	if strings.HasSuffix(schoolName, "초등학교") {
		classMin = 40
	} else if strings.HasSuffix(schoolName, "중학교") {
		classMin = 45
	}

	// Default 09:00 start
	curHour, curMin := 9, 0

	for i := 1; i <= count; i++ {
		if i == 5 {
			// Lunch break before 5th period: add 50 mins
			curMin += 50
			if curMin >= 60 {
				curHour += curMin / 60
				curMin %= 60
			}
		}

		startStr := fmt.Sprintf("%02d:%02d", curHour, curMin)

		// Add class duration
		eHour := curHour
		eMin := curMin + classMin
		if eMin >= 60 {
			eHour += eMin / 60
			eMin %= 60
		}
		endStr := fmt.Sprintf("%02d:%02d", eHour, eMin)

		p = append(p, PeriodTime{
			Period: i,
			Start:  startStr,
			End:    endStr,
		})

		// Add 10 min break
		curHour = eHour
		curMin = eMin + 10
		if curMin >= 60 {
			curHour += curMin / 60
			curMin %= 60
		}
	}
	return p
}

func fetchNEISTimetable(apiKey, officeCode, schoolCode, schoolName string, grade, classNum int) (*TimetableData, error) {
	if grade == 0 || classNum == 0 {
		return nil, nil // We can't fetch timetable without grade/class
	}

	endpoint := ""
	if strings.HasSuffix(schoolName, "초등학교") {
		endpoint = "elsTimetable"
	} else if strings.HasSuffix(schoolName, "중학교") {
		endpoint = "misTimetable"
	} else if strings.HasSuffix(schoolName, "고등학교") || strings.HasSuffix(schoolName, "고") {
		endpoint = "hisTimetable"
	} else if strings.HasSuffix(schoolName, "학교") || strings.HasSuffix(schoolName, "특수학교") {
		endpoint = "spsTimetable"
	} else {
		return nil, nil // Unknown
	}

	days, fromYMD, toYMD := getThisWeekDays()

	u := fmt.Sprintf(
		"https://open.neis.go.kr/hub/%s?KEY=%s&ATPT_OFCDC_SC_CODE=%s&SD_SCHUL_CODE=%s&TI_FROM_YMD=%s&TI_TO_YMD=%s&GRADE=%d&CLASS_NM=%d&Type=json",
		endpoint, apiKey, officeCode, schoolCode, fromYMD, toYMD, grade, classNum,
	)

	resp, err := http.Get(u)
	if err != nil {
		return nil, fmt.Errorf("시간표 네트워크 오류: %w", err)
	}
	defer resp.Body.Close()

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("시간표 응답 파싱 오류: %w", err)
	}

	if resultBytes, ok := raw["RESULT"]; ok {
		var res struct {
			Code string `json:"CODE"`
		}
		json.Unmarshal(resultBytes, &res)
		if res.Code == "INFO-200" {
			return nil, nil
		}
	}

	if endpointRaw, ok := raw[endpoint]; ok {
		var list []json.RawMessage
		if err := json.Unmarshal(endpointRaw, &list); err == nil && len(list) >= 2 {
			var rowData struct {
				Row []struct {
					ALL_TI_YMD string `json:"ALL_TI_YMD"`
					PERIO      string `json:"PERIO"`
					ITRT_CNTNT string `json:"ITRT_CNTNT"`
				} `json:"row"`
			}
			if err := json.Unmarshal(list[1], &rowData); err == nil {
				subjects := make([][]string, 7)
				for i := range subjects {
					subjects[i] = make([]string, 5)
				}

				dayMap := make(map[string]int)
				for i, d := range days {
					dayMap[d.Format("20060102")] = i
				}

				maxPeriod := 0
				for _, r := range rowData.Row {
					dayIdx, ok := dayMap[r.ALL_TI_YMD]
					if !ok {
						continue
					}

					pIndex, err := strconv.Atoi(r.PERIO)
					if err != nil || pIndex < 1 || pIndex > 7 {
						continue
					}

					if pIndex > maxPeriod {
						maxPeriod = pIndex
					}

					subjects[pIndex-1][dayIdx] = strings.ReplaceAll(r.ITRT_CNTNT, "-", "\n")
				}

				if maxPeriod == 0 {
					return nil, nil
				}

				periods := getDefaultPeriods(schoolName, maxPeriod)
				return &TimetableData{
					Headers:  []string{"월", "화", "수", "목", "금"},
					Periods:  periods,
					Subjects: subjects[:maxPeriod],
				}, nil
			}
		}
	}

	return nil, nil
}
