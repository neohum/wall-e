package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubRepo = "neohum/wall-e"
	appVersion = "1.0.12"
)

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func checkForUpdate(currentVersion string) UpdateCheckResult {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return UpdateCheckResult{
			CurrentVersion: currentVersion,
			Error:          "네트워크 오류: " + err.Error(),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return UpdateCheckResult{
			CurrentVersion: currentVersion,
			Error:          fmt.Sprintf("GitHub API 오류: %d", resp.StatusCode),
		}
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return UpdateCheckResult{
			CurrentVersion: currentVersion,
			Error:          "응답 파싱 오류",
		}
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")

	// Find installer/setup exe asset
	var downloadURL string
	for _, asset := range release.Assets {
		name := strings.ToLower(asset.Name)
		if strings.HasSuffix(name, "-installer.exe") || strings.HasSuffix(name, "-setup.exe") || strings.HasSuffix(name, "setup.exe") {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}
	// Fallback to release page
	if downloadURL == "" {
		downloadURL = release.HTMLURL
	}

	return UpdateCheckResult{
		UpdateAvailable: latestVersion != currentVersion,
		CurrentVersion:  currentVersion,
		LatestVersion:   latestVersion,
		DownloadURL:     downloadURL,
	}
}

// DownloadAndRunUpdate downloads the setup exe to %TEMP% and runs it.
// Returns an error string (empty on success).
// Emits "downloadProgress" events with (percent int, downloaded int64, total int64).
func downloadAndRunUpdate(ctx context.Context, downloadURL string) string {
	if downloadURL == "" {
		return "다운로드 URL이 없습니다"
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(downloadURL)
	if err != nil {
		return "다운로드 실패: " + err.Error()
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Sprintf("다운로드 실패: HTTP %d", resp.StatusCode)
	}

	total := resp.ContentLength

	// Save to %TEMP%\Wall-E-Setup.exe
	tmpDir := os.TempDir()
	setupPath := filepath.Join(tmpDir, "Wall-E-Setup.exe")

	f, err := os.Create(setupPath)
	if err != nil {
		return "파일 생성 실패: " + err.Error()
	}

	buf := make([]byte, 32*1024)
	var downloaded int64
	lastPercent := -1

	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := f.Write(buf[:n]); writeErr != nil {
				f.Close()
				return "파일 저장 실패: " + writeErr.Error()
			}
			downloaded += int64(n)

			if total > 0 {
				percent := int(downloaded * 100 / total)
				if percent != lastPercent {
					lastPercent = percent
					runtime.EventsEmit(ctx, "downloadProgress", percent, downloaded, total)
				}
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			f.Close()
			return "다운로드 실패: " + readErr.Error()
		}
	}
	f.Close()

	// Emit 100% to ensure UI shows completion
	if total > 0 {
		runtime.EventsEmit(ctx, "downloadProgress", 100, total, total)
	}

	// Launch the installer (detached so the app can close)
	cmd := exec.Command("cmd", "/C", "start", "", setupPath)
	cmd.SysProcAttr = detachedProcess()
	if err := cmd.Start(); err != nil {
		return "설치 프로그램 실행 실패: " + err.Error()
	}

	return ""
}
