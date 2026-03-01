package main

import (
	"bufio"
	"embed"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

// Injected at build time via -ldflags
var neisAPIKey string

// resolveNeisAPIKey returns the API key from ldflags, env var, or .env file (in that order).
func resolveNeisAPIKey() string {
	if neisAPIKey != "" {
		return neisAPIKey
	}
	if key := os.Getenv("NEIS_API_KEY"); key != "" {
		return key
	}
	// Try .env next to executable
	exe, err := os.Executable()
	if err == nil {
		envPath := filepath.Join(filepath.Dir(exe), ".env")
		if key := readEnvKey(envPath, "NEIS_API_KEY"); key != "" {
			return key
		}
	}
	// Try .env in working directory
	if key := readEnvKey(".env", "NEIS_API_KEY"); key != "" {
		return key
	}
	return ""
}

func readEnvKey(path, key string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, key+"=") {
			return strings.TrimSpace(strings.TrimPrefix(line, key+"="))
		}
	}
	return ""
}

func main() {
	if !ensureSingleInstance() {
		return
	}

	apiKey := resolveNeisAPIKey()
	app := NewApp(apiKey)

	err := wails.Run(&options.App{
		Title:     "Wall-E 학교 대시보드",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 232, G: 236, B: 244, A: 0},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Frameless: true,
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
			Theme:                windows.Light,
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}
