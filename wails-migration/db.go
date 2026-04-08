package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB() error {
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return fmt.Errorf("failed to create settings directory: %w", err)
	}

	dbPath := filepath.Join(settingsDir, "events.db")

	var err error
	// Use WAL mode and busy_timeout to prevent 'database is locked' errors during concurrent reads/writes
	dsn := dbPath + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	createTableQuery := `
	CREATE TABLE IF NOT EXISTS custom_events (
		id TEXT PRIMARY KEY,
		date TEXT NOT NULL,
		time TEXT,
		name TEXT NOT NULL,
		alarm_enabled INTEGER NOT NULL
	);
	`

	_, err = db.Exec(createTableQuery)
	if err != nil {
		return fmt.Errorf("failed to create custom_events table: %w", err)
	}

	createTimetableQuery := `
	CREATE TABLE IF NOT EXISTS custom_timetable_times (
		period INTEGER PRIMARY KEY,
		start_time TEXT NOT NULL,
		end_time TEXT NOT NULL
	);
	`
	_, err = db.Exec(createTimetableQuery)
	if err != nil {
		return fmt.Errorf("failed to create custom_timetable_times table: %w", err)
	}

	return nil
}

func closeDB() {
	if db != nil {
		db.Close()
	}
}

func GetCustomEventsFromDB() ([]CustomEvent, error) {
	events := []CustomEvent{}

	if db == nil {
		return events, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query("SELECT id, date, time, name, alarm_enabled FROM custom_events")
	if err != nil {
		return events, fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var e CustomEvent
		var alarmInt int
		err := rows.Scan(&e.ID, &e.Date, &e.Time, &e.Name, &alarmInt)
		if err != nil {
			return events, fmt.Errorf("failed to scan event row: %w", err)
		}
		e.AlarmEnabled = alarmInt == 1
		events = append(events, e)
	}

	return events, nil
}

func AddCustomEventToDB(e CustomEvent) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	alarmInt := 0
	if e.AlarmEnabled {
		alarmInt = 1
	}

	_, err := db.Exec(`
		INSERT INTO custom_events (id, date, time, name, alarm_enabled) 
		VALUES (?, ?, ?, ?, ?)
	`, e.ID, e.Date, e.Time, e.Name, alarmInt)
	
	if err != nil {
		return fmt.Errorf("failed to insert event: %w", err)
	}
	return nil
}

func DeleteCustomEventFromDB(id string) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := db.Exec("DELETE FROM custom_events WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete event: %w", err)
	}
	return nil
}

func UpdateCustomEventInDB(e CustomEvent) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	alarmInt := 0
	if e.AlarmEnabled {
		alarmInt = 1
	}

	_, err := db.Exec(`
		UPDATE custom_events SET date = ?, time = ?, name = ?, alarm_enabled = ? WHERE id = ?
	`, e.Date, e.Time, e.Name, alarmInt, e.ID)
	
	if err != nil {
		return fmt.Errorf("failed to update event: %w", err)
	}
	return nil
}

func GetCustomTimetableTimesFromDB() ([]PeriodTime, error) {
	periods := []PeriodTime{}

	if db == nil {
		return periods, fmt.Errorf("database not initialized")
	}

	rows, err := db.Query("SELECT period, start_time, end_time FROM custom_timetable_times ORDER BY period ASC")
	if err != nil {
		return periods, fmt.Errorf("failed to query custom timetable times: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p PeriodTime
		err := rows.Scan(&p.Period, &p.Start, &p.End)
		if err != nil {
			return periods, fmt.Errorf("failed to scan period row: %w", err)
		}
		periods = append(periods, p)
	}

	return periods, nil
}

func SaveCustomTimetableTimesToDB(periods []PeriodTime) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	_, err = tx.Exec("DELETE FROM custom_timetable_times")
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to clear custom_timetable_times: %w", err)
	}

	stmt, err := tx.Prepare("INSERT INTO custom_timetable_times (period, start_time, end_time) VALUES (?, ?, ?)")
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to prepare insert statement: %w", err)
	}
	defer stmt.Close()

	for _, p := range periods {
		_, err = stmt.Exec(p.Period, p.Start, p.End)
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to insert period %d: %w", p.Period, err)
		}
	}

	return tx.Commit()
}
