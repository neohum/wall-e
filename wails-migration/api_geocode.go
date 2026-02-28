package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
)

func geocodeAddress(address string) (*Coords, error) {
	u := fmt.Sprintf(
		"https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1&countrycodes=kr",
		url.QueryEscape(address),
	)

	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Language", "ko")
	req.Header.Set("User-Agent", "Wall-E-SchoolDashboard/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("geocode API returned %d", resp.StatusCode)
	}

	var results []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	if len(results) == 0 {
		return nil, nil
	}

	lat, err := strconv.ParseFloat(results[0].Lat, 64)
	if err != nil {
		return nil, err
	}
	lon, err := strconv.ParseFloat(results[0].Lon, 64)
	if err != nil {
		return nil, err
	}

	return &Coords{Lat: lat, Lon: lon}, nil
}
