package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
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
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		MealServiceDietInfo []json.RawMessage `json:"mealServiceDietInfo"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
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
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		SchoolInfo []json.RawMessage `json:"schoolInfo"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
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
		return nil, err
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
		return nil, err
	}
	defer resp.Body.Close()

	var raw struct {
		SchoolSchedule []json.RawMessage `json:"SchoolSchedule"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
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
