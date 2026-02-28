package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type AirQualityData struct {
	PM10 float64 `json:"pm10"`
	PM25 float64 `json:"pm25"`
}

func fetchAirQuality(lat, lon float64) (*AirQualityData, error) {
	url := fmt.Sprintf(
		"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%f&longitude=%f&current=pm10,pm2_5&timezone=Asia/Seoul",
		lat, lon,
	)

	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("air quality API returned %d", resp.StatusCode)
	}

	var raw struct {
		Current struct {
			PM10 float64 `json:"pm10"`
			PM25 float64 `json:"pm2_5"`
		} `json:"current"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	return &AirQualityData{
		PM10: raw.Current.PM10,
		PM25: raw.Current.PM25,
	}, nil
}
