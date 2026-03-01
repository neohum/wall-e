//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows/registry"
)

const autoStartRegKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const autoStartAppName = "Wall-E"

func getAutoStartEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, autoStartRegKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	_, _, err = k.GetStringValue(autoStartAppName)
	return err == nil
}

func setAutoStart(enabled bool) {
	k, err := registry.OpenKey(registry.CURRENT_USER, autoStartRegKey, registry.SET_VALUE)
	if err != nil {
		return
	}
	defer k.Close()

	if enabled {
		exePath, err := os.Executable()
		if err != nil {
			return
		}
		// Quote the path in case it contains spaces
		quoted := `"` + exePath + `"`
		_ = k.SetStringValue(autoStartAppName, quoted)
	} else {
		_ = k.DeleteValue(autoStartAppName)
	}
}
