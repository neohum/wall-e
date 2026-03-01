package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx        context.Context
	neisAPIKey string
}

func NewApp(neisAPIKey string) *App {
	return &App{neisAPIKey: neisAPIKey}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.setupTray()
}

func (a *App) shutdown(ctx context.Context) {}

// getEffectiveAPIKey returns the user's custom key if enabled, otherwise the built-in key.
func (a *App) getEffectiveAPIKey() string {
	s := loadSettings()
	if s.UseCustomAPIKey && s.CustomAPIKey != "" {
		return s.CustomAPIKey
	}
	return a.neisAPIKey
}

// ===== Settings bindings =====

func (a *App) GetSettings() Settings {
	return loadSettings()
}

func (a *App) SaveSettings(s Settings) {
	if err := saveSettings(s); err != nil {
		runtime.LogError(a.ctx, "Failed to save settings: "+err.Error())
	}
	runtime.EventsEmit(a.ctx, "settingsChanged")
}

// ===== Dashboard data =====

type DashboardData struct {
	Weather    *WeatherData     `json:"weather"`
	AirQuality *AirQualityData  `json:"airQuality"`
	Meals      []MealData       `json:"meals"`
	Events     []ScheduleEvent  `json:"events"`
	Timetable  *TimetableData   `json:"timetable"`
	StudyPlan  *StudyPlanResult `json:"studyPlan"`
}

func (a *App) FetchDashboardData() DashboardData {
	s := loadSettings()
	apiKey := a.getEffectiveAPIKey()
	result := DashboardData{}

	var wg sync.WaitGroup
	var mu sync.Mutex

	// Weather
	wg.Add(1)
	go func() {
		defer wg.Done()
		if s.Latitude != 0 || s.Longitude != 0 {
			w, _ := fetchWeather(s.Latitude, s.Longitude)
			mu.Lock()
			result.Weather = w
			mu.Unlock()
		}
	}()

	// Air quality
	wg.Add(1)
	go func() {
		defer wg.Done()
		if s.Latitude != 0 || s.Longitude != 0 {
			aq, _ := fetchAirQuality(s.Latitude, s.Longitude)
			mu.Lock()
			result.AirQuality = aq
			mu.Unlock()
		}
	}()

	// Meals
	wg.Add(1)
	go func() {
		defer wg.Done()
		if apiKey != "" && s.SchoolCode != "" && s.OfficeCode != "" {
			today := todayStr()
			toDate := dateAfterDays(7)
			meals, err := fetchMeals(apiKey, s.OfficeCode, s.SchoolCode, today, toDate)
			if err != nil {
				runtime.LogError(a.ctx, "Meals fetch error: "+err.Error())
			}
			mu.Lock()
			result.Meals = meals
			mu.Unlock()
		} else {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Meals skipped: apiKey=%v, schoolCode=%q, officeCode=%q", apiKey != "", s.SchoolCode, s.OfficeCode))
		}
	}()

	// NEIS events
	var neisEvents []ScheduleEvent
	wg.Add(1)
	go func() {
		defer wg.Done()
		if apiKey != "" && s.SchoolCode != "" && s.OfficeCode != "" {
			today := todayStr()
			eventEnd := endOfMonthPlus2()
			evts, err := fetchSchoolEvents(apiKey, s.OfficeCode, s.SchoolCode, today, eventEnd)
			if err != nil {
				runtime.LogError(a.ctx, "Events fetch error: "+err.Error())
			}
			mu.Lock()
			neisEvents = evts
			mu.Unlock()
		} else {
			runtime.LogWarning(a.ctx, fmt.Sprintf("Events skipped: apiKey=%v, schoolCode=%q, officeCode=%q", apiKey != "", s.SchoolCode, s.OfficeCode))
		}
	}()

	// Timetable from spreadsheet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if s.SpreadsheetURL != "" {
			tt, _ := fetchTimetableFromSheet(s.SpreadsheetURL)
			mu.Lock()
			result.Timetable = tt
			mu.Unlock()
		}
	}()

	// Sheet events
	var sheetEvents []ScheduleEvent
	wg.Add(1)
	go func() {
		defer wg.Done()
		if s.SpreadsheetURL != "" {
			evts, _ := fetchEventsFromSheet(s.SpreadsheetURL)
			mu.Lock()
			sheetEvents = evts
			mu.Unlock()
		}
	}()

	// Study plan from spreadsheet
	wg.Add(1)
	go func() {
		defer wg.Done()
		if s.SpreadsheetURL != "" {
			sp, _ := fetchStudyPlanFromSheet(s.SpreadsheetURL)
			mu.Lock()
			result.StudyPlan = sp
			mu.Unlock()
		}
	}()

	wg.Wait()

	// Merge and deduplicate events
	result.Events = mergeEvents(neisEvents, sheetEvents)

	// Ensure non-nil slices for JSON
	if result.Meals == nil {
		result.Meals = []MealData{}
	}
	if result.Events == nil {
		result.Events = []ScheduleEvent{}
	}
	return result
}

// ===== School Search =====

type SchoolSearchResult struct {
	Schools []SchoolInfo `json:"schools"`
	Error   string       `json:"error"`
}

func (a *App) SearchSchool(name string) SchoolSearchResult {
	apiKey := a.getEffectiveAPIKey()
	if apiKey == "" {
		return SchoolSearchResult{Error: "NEIS API 키가 설정되지 않았습니다. 설정에서 개인 인증키를 입력해 주세요."}
	}
	if name == "" {
		return SchoolSearchResult{Schools: []SchoolInfo{}}
	}
	results, err := searchSchool(apiKey, name)
	if err != nil {
		runtime.LogError(a.ctx, "School search error: "+err.Error())
		return SchoolSearchResult{Error: err.Error()}
	}
	if results == nil {
		results = []SchoolInfo{}
	}
	return SchoolSearchResult{Schools: results}
}

// ===== Geocoding =====

type Coords struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

func (a *App) GeocodeAddress(addr string) *Coords {
	c, err := geocodeAddress(addr)
	if err != nil || c == nil {
		return nil
	}
	return c
}

// ===== Alarm File Picker =====

type AlarmFileResult struct {
	Data string `json:"data"`
	Name string `json:"name"`
}

func (a *App) PickAlarmFile() *AlarmFileResult {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "알림음 파일 선택",
		Filters: []runtime.FileFilter{
			{DisplayName: "Audio Files", Pattern: "*.mp3;*.wav;*.ogg;*.m4a;*.webm"},
		},
	})
	if err != nil || path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	name := filepath.Base(path)
	ext := strings.ToLower(filepath.Ext(path))
	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		mimeMap := map[string]string{
			".mp3":  "audio/mpeg",
			".wav":  "audio/wav",
			".ogg":  "audio/ogg",
			".m4a":  "audio/mp4",
			".webm": "audio/webm",
		}
		mimeType = mimeMap[ext]
		if mimeType == "" {
			mimeType = "audio/mpeg"
		}
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, b64)

	return &AlarmFileResult{Data: dataURL, Name: name}
}

// ===== Custom Background =====

type BackgroundFileResult struct {
	Id       string `json:"id"`
	Name     string `json:"name"`
	FileName string `json:"fileName"`
}

func (a *App) PickBackgroundFile() *BackgroundFileResult {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "배경 이미지 선택",
		Filters: []runtime.FileFilter{
			{DisplayName: "Image Files", Pattern: "*.jpg;*.jpeg;*.png;*.webp;*.bmp"},
		},
	})
	if err != nil || path == "" {
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	origName := filepath.Base(path)
	ext := filepath.Ext(path)
	id := uuid.New().String()
	fileName := id + ext

	bgDir := filepath.Join(settingsDir, "backgrounds")
	if err := os.MkdirAll(bgDir, 0755); err != nil {
		return nil
	}

	destPath := filepath.Join(bgDir, fileName)
	if err := os.WriteFile(destPath, data, 0644); err != nil {
		return nil
	}

	return &BackgroundFileResult{
		Id:       id,
		Name:     origName,
		FileName: fileName,
	}
}

func (a *App) GetCustomBackgroundURL(id string) string {
	s := loadSettings()
	for _, bg := range s.CustomBackgrounds {
		if bg.Id == id {
			bgPath := filepath.Join(settingsDir, "backgrounds", bg.FileName)
			data, err := os.ReadFile(bgPath)
			if err != nil {
				return ""
			}

			ext := strings.ToLower(filepath.Ext(bg.FileName))
			mimeType := mime.TypeByExtension(ext)
			if mimeType == "" {
				mimeMap := map[string]string{
					".jpg":  "image/jpeg",
					".jpeg": "image/jpeg",
					".png":  "image/png",
					".webp": "image/webp",
					".bmp":  "image/bmp",
				}
				mimeType = mimeMap[ext]
				if mimeType == "" {
					mimeType = "image/jpeg"
				}
			}

			b64 := base64.StdEncoding.EncodeToString(data)
			return fmt.Sprintf("data:%s;base64,%s", mimeType, b64)
		}
	}
	return ""
}

func (a *App) RemoveCustomBackground(id string) {
	s := loadSettings()

	var removed *CustomBackground
	var remaining []CustomBackground
	for _, bg := range s.CustomBackgrounds {
		if bg.Id == id {
			bgCopy := bg
			removed = &bgCopy
		} else {
			remaining = append(remaining, bg)
		}
	}

	if removed != nil {
		bgPath := filepath.Join(settingsDir, "backgrounds", removed.FileName)
		os.Remove(bgPath)
	}

	s.CustomBackgrounds = remaining
	if s.BackgroundID == "custom:"+id {
		s.BackgroundID = ""
	}
	saveSettings(s)
	runtime.EventsEmit(a.ctx, "settingsChanged")
}

// ===== Auto Start =====

func (a *App) GetAutoStart() bool {
	return getAutoStartEnabled()
}

func (a *App) SetAutoStart(enabled bool) {
	setAutoStart(enabled)
}

// ===== Window Controls =====

func (a *App) MinimizeWindow() {
	runtime.WindowMinimise(a.ctx)
}

func (a *App) MaximizeWindow() {
	runtime.WindowToggleMaximise(a.ctx)
}

func (a *App) CloseWindow() {
	runtime.WindowHide(a.ctx)
}

func (a *App) GetNeisAPIKey() string {
	return a.neisAPIKey
}

func (a *App) GetAppVersion() string {
	return appVersion
}

// ===== Update Check =====

type UpdateCheckResult struct {
	UpdateAvailable bool   `json:"updateAvailable"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	DownloadURL     string `json:"downloadURL"`
	Error           string `json:"error"`
}

func (a *App) CheckForUpdate() UpdateCheckResult {
	return checkForUpdate(appVersion)
}

// DownloadAndRunUpdate downloads the setup exe and runs it silently.
// Returns an empty string on success, or an error message.
func (a *App) DownloadAndRunUpdate(url string) string {
	return downloadAndRunUpdate(a.ctx, url)
}

func (a *App) OpenDownloadURL(url string) {
	runtime.BrowserOpenURL(a.ctx, url)
}

// ===== Helpers =====

func mergeEvents(neis, sheet []ScheduleEvent) []ScheduleEvent {
	all := append(neis, sheet...)
	seen := make(map[string]bool)
	var result []ScheduleEvent

	for _, e := range all {
		key := e.Date + "-" + e.Name
		if !seen[key] {
			seen[key] = true
			result = append(result, e)
		}
	}

	// Sort by date
	for i := 0; i < len(result); i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].Date > result[j].Date {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	// Limit to 30
	if len(result) > 30 {
		result = result[:30]
	}

	return result
}
