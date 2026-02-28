package main

import (
	"os"
	"os/exec"
	"path/filepath"
)

var (
	startupFolder string
	shortcutPath  string
)

func init() {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	startupFolder = filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
	shortcutPath = filepath.Join(startupFolder, "Wall-E.lnk")
}

func getAutoStartEnabled() bool {
	_, err := os.Stat(shortcutPath)
	return err == nil
}

func setAutoStart(enabled bool) {
	if enabled {
		exePath, err := os.Executable()
		if err != nil {
			return
		}
		workDir := filepath.Dir(exePath)

		ps := `$ws = New-Object -ComObject WScript.Shell; ` +
			`$s = $ws.CreateShortcut('` + escapePS(shortcutPath) + `'); ` +
			`$s.TargetPath = '` + escapePS(exePath) + `'; ` +
			`$s.WorkingDirectory = '` + escapePS(workDir) + `'; ` +
			`$s.Description = 'Wall-E School Dashboard'; ` +
			`$s.Save()`

		cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", ps)
		cmd.Stdout = nil
		cmd.Stderr = nil
		_ = cmd.Run()
	} else {
		_ = os.Remove(shortcutPath)
	}
}

func escapePS(s string) string {
	result := ""
	for _, c := range s {
		if c == '\'' {
			result += "''"
		} else {
			result += string(c)
		}
	}
	return result
}
