package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	githubRepo = "neohum/wall-e"
	appVersion = "1.0.6"
)

type githubRelease struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
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

	return UpdateCheckResult{
		UpdateAvailable: latestVersion != currentVersion,
		CurrentVersion:  currentVersion,
		LatestVersion:   latestVersion,
		DownloadURL:     release.HTMLURL,
	}
}
