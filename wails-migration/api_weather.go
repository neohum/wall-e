package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type WeatherData struct {
	Temperature              float64 `json:"temperature"`
	WeatherCode              int     `json:"weatherCode"`
	DailyMax                 float64 `json:"dailyMax"`
	DailyMin                 float64 `json:"dailyMin"`
	PrecipitationProbability float64 `json:"precipitationProbability"`
}

func fetchWeather(lat, lon float64) (*WeatherData, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%f&longitude=%f&current_weather=true&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=1",
		lat, lon,
	)

	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("weather API returned %d", resp.StatusCode)
	}

	var raw struct {
		CurrentWeather struct {
			Temperature float64 `json:"temperature"`
			WeatherCode int     `json:"weathercode"`
		} `json:"current_weather"`
		Daily struct {
			TempMax    []float64 `json:"temperature_2m_max"`
			TempMin    []float64 `json:"temperature_2m_min"`
			PrecipProb []float64 `json:"precipitation_probability_max"`
		} `json:"daily"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	w := &WeatherData{
		Temperature: raw.CurrentWeather.Temperature,
		WeatherCode: raw.CurrentWeather.WeatherCode,
	}
	if len(raw.Daily.TempMax) > 0 {
		w.DailyMax = raw.Daily.TempMax[0]
	}
	if len(raw.Daily.TempMin) > 0 {
		w.DailyMin = raw.Daily.TempMin[0]
	}
	if len(raw.Daily.PrecipProb) > 0 {
		w.PrecipitationProbability = raw.Daily.PrecipProb[0]
	}

	return w, nil
}
