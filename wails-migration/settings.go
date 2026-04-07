package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type CustomBackground struct {
	Id       string `json:"id"`
	Name     string `json:"name"`
	FileName string `json:"fileName"`
}

type CustomEvent struct {
	ID           string `json:"id"`
	Date         string `json:"date"` // YYYY-MM-DD
	Time         string `json:"time"` // HH:MM, can be empty
	Name         string `json:"name"`
	AlarmEnabled bool   `json:"alarmEnabled"`
}

type Settings struct {
	SchoolName        string             `json:"schoolName"`
	SchoolCode        string             `json:"schoolCode"`
	OfficeCode        string             `json:"officeCode"`
	Grade             int                `json:"grade"`
	ClassNum          int                `json:"classNum"`
	Latitude          float64            `json:"latitude"`
	Longitude         float64            `json:"longitude"`
	UseCustomAPIKey   bool               `json:"useCustomApiKey"`
	CustomAPIKey      string             `json:"customApiKey"`
	AlarmEnabled      bool               `json:"alarmEnabled"`
	AlarmSound        string             `json:"alarmSound"`
	CustomAlarmData   string             `json:"customAlarmData"`
	CustomAlarmName   string             `json:"customAlarmName"`
	TimeAnnouncement  bool               `json:"timeAnnouncement"`
	PanelOpacity      float64            `json:"panelOpacity"`
	BackgroundID      string             `json:"backgroundId"`
	CustomBackgrounds []CustomBackground `json:"customBackgrounds"`
	StudyPlanFolder   string             `json:"studyPlanFolder"`
	EventAlarmEnabled bool               `json:"eventAlarmEnabled"`
	EventAlarmSound   string             `json:"eventAlarmSound"`
}

var defaultSettings = Settings{
	AlarmEnabled:      true,
	AlarmSound:        "classic",
	PanelOpacity:      0.5,
	EventAlarmEnabled: true,
	EventAlarmSound:   "classic",
}

var (
	settingsMu   sync.Mutex
	settingsDir  string
	settingsPath string
)

func init() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	settingsDir = filepath.Join(appData, "Wall-E")
	settingsPath = filepath.Join(settingsDir, "settings.json")
}

func loadSettings() Settings {
	settingsMu.Lock()
	defer settingsMu.Unlock()

	s := defaultSettings
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return s
	}
	_ = json.Unmarshal(data, &s)
	return s
}

func saveSettings(s Settings) error {
	settingsMu.Lock()
	defer settingsMu.Unlock()

	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath, data, 0644)
}
