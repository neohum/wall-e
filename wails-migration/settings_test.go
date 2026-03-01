package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// overrideSettingsPath redirects the package-level path variables to a temp
// directory for the duration of a single test, then restores them via the
// returned cleanup function.  The mutex (settingsMu) is already zero-valued
// and unlocked between tests, so no extra reset is needed there.
func overrideSettingsPath(t *testing.T) (dir string, cleanup func()) {
	t.Helper()
	tmp := t.TempDir()
	dir = filepath.Join(tmp, "Wall-E")

	old := settingsPath
	oldDir := settingsDir

	settingsDir = dir
	settingsPath = filepath.Join(dir, "settings.json")

	cleanup = func() {
		settingsDir = oldDir
		settingsPath = old
	}
	return dir, cleanup
}

// --- loadSettings ---

// TestLoadSettings_NoFile verifies that loadSettings returns the compiled-in
// defaults when no settings file exists yet.
func TestLoadSettings_NoFile(t *testing.T) {
	_, cleanup := overrideSettingsPath(t)
	defer cleanup()

	// Temp dir exists but the Wall-E sub-directory (and file) do not.
	s := loadSettings()

	if s.AlarmEnabled != defaultSettings.AlarmEnabled {
		t.Errorf("AlarmEnabled: got %v, want %v", s.AlarmEnabled, defaultSettings.AlarmEnabled)
	}
	if s.AlarmSound != defaultSettings.AlarmSound {
		t.Errorf("AlarmSound: got %q, want %q", s.AlarmSound, defaultSettings.AlarmSound)
	}
	// Zero-value string fields should be empty.
	if s.SchoolName != "" {
		t.Errorf("SchoolName: got %q, want empty string", s.SchoolName)
	}
	if s.SchoolCode != "" {
		t.Errorf("SchoolCode: got %q, want empty string", s.SchoolCode)
	}
	if s.OfficeCode != "" {
		t.Errorf("OfficeCode: got %q, want empty string", s.OfficeCode)
	}
	if s.Grade != 0 {
		t.Errorf("Grade: got %d, want 0", s.Grade)
	}
	if s.ClassNum != 0 {
		t.Errorf("ClassNum: got %d, want 0", s.ClassNum)
	}
	if s.Latitude != 0 {
		t.Errorf("Latitude: got %v, want 0", s.Latitude)
	}
	if s.Longitude != 0 {
		t.Errorf("Longitude: got %v, want 0", s.Longitude)
	}
}

// TestLoadSettings_EmptyFile verifies graceful handling of a zero-byte file:
// JSON unmarshal fails silently and defaults are preserved.
func TestLoadSettings_EmptyFile(t *testing.T) {
	dir, cleanup := overrideSettingsPath(t)
	defer cleanup()

	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(settingsPath, []byte{}, 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := loadSettings()

	if s.AlarmEnabled != defaultSettings.AlarmEnabled {
		t.Errorf("AlarmEnabled: got %v, want %v", s.AlarmEnabled, defaultSettings.AlarmEnabled)
	}
	if s.AlarmSound != defaultSettings.AlarmSound {
		t.Errorf("AlarmSound: got %q, want %q", s.AlarmSound, defaultSettings.AlarmSound)
	}
}

// TestLoadSettings_InvalidJSON verifies graceful handling of corrupt JSON:
// the struct starts from defaults, unmarshal fails silently, and defaults are
// returned unchanged.
func TestLoadSettings_InvalidJSON(t *testing.T) {
	dir, cleanup := overrideSettingsPath(t)
	defer cleanup()

	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(settingsPath, []byte("{not valid json"), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := loadSettings()

	// Defaults must still be intact.
	if s.AlarmEnabled != defaultSettings.AlarmEnabled {
		t.Errorf("AlarmEnabled: got %v, want %v", s.AlarmEnabled, defaultSettings.AlarmEnabled)
	}
	if s.AlarmSound != defaultSettings.AlarmSound {
		t.Errorf("AlarmSound: got %q, want %q", s.AlarmSound, defaultSettings.AlarmSound)
	}
}

// --- saveSettings ---

// TestSaveSettings_CreatesDirectory verifies that saveSettings creates the
// destination directory when it does not exist yet.
func TestSaveSettings_CreatesDirectory(t *testing.T) {
	dir, cleanup := overrideSettingsPath(t)
	defer cleanup()

	// The Wall-E sub-directory must NOT exist before the call.
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("expected directory to not exist before save, got: %v", err)
	}

	s := defaultSettings
	if err := saveSettings(s); err != nil {
		t.Fatalf("saveSettings returned error: %v", err)
	}

	if _, err := os.Stat(settingsPath); err != nil {
		t.Errorf("expected settings file to exist after save: %v", err)
	}
}

// TestSaveSettings_WritesValidJSON verifies that the file written by
// saveSettings contains parseable JSON.
func TestSaveSettings_WritesValidJSON(t *testing.T) {
	_, cleanup := overrideSettingsPath(t)
	defer cleanup()

	in := Settings{
		SchoolName: "진영중앙초등학교",
		SchoolCode: "8490064",
		OfficeCode: "J10",
		Grade:      3,
		ClassNum:   2,
		Latitude:   35.6,
		Longitude:  128.7,
		AlarmEnabled: true,
		AlarmSound:   "classic",
		BackgroundID: "sky",
	}

	if err := saveSettings(in); err != nil {
		t.Fatalf("saveSettings: %v", err)
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	var out Settings
	if err := json.Unmarshal(data, &out); err != nil {
		t.Fatalf("JSON in file is invalid: %v", err)
	}
}

// --- round-trip ---

// TestSaveLoadRoundTrip verifies that every field survives a full
// saveSettings → loadSettings cycle without mutation.
func TestSaveLoadRoundTrip(t *testing.T) {
	_, cleanup := overrideSettingsPath(t)
	defer cleanup()

	original := Settings{
		SchoolName:      "테스트학교",
		SchoolCode:      "1234567",
		OfficeCode:      "B10",
		Grade:           5,
		ClassNum:        3,
		Latitude:        37.5665,
		Longitude:       126.9780,
		SpreadsheetURL:  "https://docs.google.com/spreadsheets/d/example",
		AlarmEnabled:    true,
		AlarmSound:      "bell",
		CustomAlarmData: "base64encodeddata==",
		CustomAlarmName: "MyAlarm",
		BackgroundID:    "forest",
	}

	if err := saveSettings(original); err != nil {
		t.Fatalf("saveSettings: %v", err)
	}

	loaded := loadSettings()

	if loaded.SchoolName != original.SchoolName {
		t.Errorf("SchoolName: got %q, want %q", loaded.SchoolName, original.SchoolName)
	}
	if loaded.SchoolCode != original.SchoolCode {
		t.Errorf("SchoolCode: got %q, want %q", loaded.SchoolCode, original.SchoolCode)
	}
	if loaded.OfficeCode != original.OfficeCode {
		t.Errorf("OfficeCode: got %q, want %q", loaded.OfficeCode, original.OfficeCode)
	}
	if loaded.Grade != original.Grade {
		t.Errorf("Grade: got %d, want %d", loaded.Grade, original.Grade)
	}
	if loaded.ClassNum != original.ClassNum {
		t.Errorf("ClassNum: got %d, want %d", loaded.ClassNum, original.ClassNum)
	}
	if loaded.Latitude != original.Latitude {
		t.Errorf("Latitude: got %v, want %v", loaded.Latitude, original.Latitude)
	}
	if loaded.Longitude != original.Longitude {
		t.Errorf("Longitude: got %v, want %v", loaded.Longitude, original.Longitude)
	}
	if loaded.SpreadsheetURL != original.SpreadsheetURL {
		t.Errorf("SpreadsheetURL: got %q, want %q", loaded.SpreadsheetURL, original.SpreadsheetURL)
	}
	if loaded.AlarmEnabled != original.AlarmEnabled {
		t.Errorf("AlarmEnabled: got %v, want %v", loaded.AlarmEnabled, original.AlarmEnabled)
	}
	if loaded.AlarmSound != original.AlarmSound {
		t.Errorf("AlarmSound: got %q, want %q", loaded.AlarmSound, original.AlarmSound)
	}
	if loaded.CustomAlarmData != original.CustomAlarmData {
		t.Errorf("CustomAlarmData: got %q, want %q", loaded.CustomAlarmData, original.CustomAlarmData)
	}
	if loaded.CustomAlarmName != original.CustomAlarmName {
		t.Errorf("CustomAlarmName: got %q, want %q", loaded.CustomAlarmName, original.CustomAlarmName)
	}
	if loaded.BackgroundID != original.BackgroundID {
		t.Errorf("BackgroundID: got %q, want %q", loaded.BackgroundID, original.BackgroundID)
	}
}

// --- JSON serialization ---

// TestSettingsJSONFieldNames verifies that the struct marshals to the exact
// camelCase JSON keys declared in the struct tags, covering every field.
func TestSettingsJSONFieldNames(t *testing.T) {
	s := Settings{
		SchoolName:      "A",
		SchoolCode:      "B",
		OfficeCode:      "C",
		Grade:           1,
		ClassNum:        2,
		Latitude:        10.1,
		Longitude:       20.2,
		SpreadsheetURL:  "D",
		AlarmEnabled:    true,
		AlarmSound:      "E",
		CustomAlarmData: "F",
		CustomAlarmName: "G",
		BackgroundID:    "H",
	}

	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("json.Unmarshal into map: %v", err)
	}

	expectedKeys := []string{
		"schoolName",
		"schoolCode",
		"officeCode",
		"grade",
		"classNum",
		"latitude",
		"longitude",
		"spreadsheetUrl",
		"alarmEnabled",
		"alarmSound",
		"customAlarmData",
		"customAlarmName",
		"backgroundId",
		"customBackgrounds",
	}

	for _, key := range expectedKeys {
		if _, ok := m[key]; !ok {
			t.Errorf("expected JSON key %q to be present, but it was missing", key)
		}
	}

	if len(m) != len(expectedKeys) {
		t.Errorf("JSON object has %d keys, want %d", len(m), len(expectedKeys))
	}
}

// --- partial JSON / default merging ---

// TestLoadSettings_PartialJSON verifies the merge behaviour: fields present in
// the file overwrite the defaults, while absent fields keep their default
// values.  loadSettings starts from a copy of defaultSettings and then
// unmarshals the file on top of it, so missing JSON keys leave the defaults
// intact.
func TestLoadSettings_PartialJSON(t *testing.T) {
	dir, cleanup := overrideSettingsPath(t)
	defer cleanup()

	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	// Only SchoolName and AlarmSound are present in the file; everything else
	// is absent, so defaults should be preserved.
	partial := `{"schoolName":"부분학교","alarmSound":"piano"}`
	if err := os.WriteFile(settingsPath, []byte(partial), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := loadSettings()

	// Fields from the file should be applied.
	if s.SchoolName != "부분학교" {
		t.Errorf("SchoolName: got %q, want %q", s.SchoolName, "부분학교")
	}
	if s.AlarmSound != "piano" {
		t.Errorf("AlarmSound: got %q, want %q", s.AlarmSound, "piano")
	}

	// AlarmEnabled was NOT in the JSON, so the default (true) must survive.
	if s.AlarmEnabled != defaultSettings.AlarmEnabled {
		t.Errorf("AlarmEnabled: got %v, want default %v", s.AlarmEnabled, defaultSettings.AlarmEnabled)
	}

	// Zero-value defaults for absent fields.
	if s.Grade != 0 {
		t.Errorf("Grade: got %d, want 0", s.Grade)
	}
	if s.SchoolCode != "" {
		t.Errorf("SchoolCode: got %q, want empty string", s.SchoolCode)
	}
}

// TestLoadSettings_PartialJSON_AlarmEnabledFalse confirms that an explicit
// false in the JSON really does override the default true, ruling out any
// ambiguity between "absent" and "false".
func TestLoadSettings_PartialJSON_AlarmEnabledFalse(t *testing.T) {
	dir, cleanup := overrideSettingsPath(t)
	defer cleanup()

	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}

	payload := `{"alarmEnabled":false}`
	if err := os.WriteFile(settingsPath, []byte(payload), 0644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	s := loadSettings()

	if s.AlarmEnabled != false {
		t.Errorf("AlarmEnabled: got %v, want false (explicit override)", s.AlarmEnabled)
	}
	// AlarmSound was absent, so the default must survive.
	if s.AlarmSound != defaultSettings.AlarmSound {
		t.Errorf("AlarmSound: got %q, want default %q", s.AlarmSound, defaultSettings.AlarmSound)
	}
}

// --- overwrite ---

// TestSaveSettings_Overwrite verifies that a second saveSettings call fully
// replaces the first file rather than merging or appending.
func TestSaveSettings_Overwrite(t *testing.T) {
	_, cleanup := overrideSettingsPath(t)
	defer cleanup()

	first := Settings{SchoolName: "첫번째학교", AlarmEnabled: true, AlarmSound: "classic"}
	if err := saveSettings(first); err != nil {
		t.Fatalf("first saveSettings: %v", err)
	}

	second := Settings{SchoolName: "두번째학교", AlarmEnabled: false, AlarmSound: "bell"}
	if err := saveSettings(second); err != nil {
		t.Fatalf("second saveSettings: %v", err)
	}

	loaded := loadSettings()

	if loaded.SchoolName != "두번째학교" {
		t.Errorf("SchoolName after overwrite: got %q, want %q", loaded.SchoolName, "두번째학교")
	}
	if loaded.AlarmEnabled != false {
		t.Errorf("AlarmEnabled after overwrite: got %v, want false", loaded.AlarmEnabled)
	}
	if loaded.AlarmSound != "bell" {
		t.Errorf("AlarmSound after overwrite: got %q, want %q", loaded.AlarmSound, "bell")
	}
}
