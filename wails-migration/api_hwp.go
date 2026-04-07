package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	hwpSyncMutex  sync.Mutex
	hwpSyncActive bool
)

// GetStudyPlanPDFs returns immediately with all successfully cached PDF base64s,
// sorted by original filename (which usually implies week order).
// It also kicks off a background goroutine to convert any missing PDFs without blocking.
func GetStudyPlanPDFs(ctx context.Context, folder string) ([]string, int, bool, error) {
	if folder == "" {
		return nil, 0, false, fmt.Errorf("folder is empty")
	}

	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, 0, false, fmt.Errorf("폴더를 열 수 없습니다: %w", err)
	}

	type fileJob struct {
		hwpPath string
		pdfPath string
		name    string
	}

	var jobs []fileJob
	var pdfBase64s []string

	now := time.Now()
	wd := int(now.Weekday())
	if wd == 0 { wd = 7 }
	offset := 1 - wd
	monday := now.AddDate(0, 0, offset)
	week := weekOfMonth(monday)

	var currentIndex int = -1

	// Gather all HWP files and sort them by name (e.g. 1학기 1주차 -> 1학기 2주차)
	var hwpNames []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".hwp") {
			hwpNames = append(hwpNames, e.Name())
		}
	}
	sort.Strings(hwpNames)

	for _, name := range hwpNames {
		hwpPath := filepath.Join(folder, name)
		hwpInfo, err := os.Stat(hwpPath)
		if err != nil {
			continue
		}
		
		extMatch := filepath.Ext(name)
		pdfName := name[:len(name)-len(extMatch)] + ".pdf"
		pdfPath := filepath.Join(folder, pdfName)

		pdfInfo, statErr := os.Stat(pdfPath)

		// Convert if PDF does not exist OR if HWP is newer than PDF
		if os.IsNotExist(statErr) || (statErr == nil && hwpInfo.ModTime().After(pdfInfo.ModTime())) {
			jobs = append(jobs, fileJob{hwpPath: hwpPath, pdfPath: pdfPath, name: name})
		} else if statErr == nil {
			// Read already cached PDF
			pdfData, err := os.ReadFile(pdfPath)
			if err == nil {
				matched := false
				for i := 0; i < 5; i++ {
					d := monday.AddDate(0, 0, i)
					patterns := []string{
						fmt.Sprintf("%d.%d", d.Month(), d.Day()),
						fmt.Sprintf("%02d%02d", int(d.Month()), int(d.Day())),
						fmt.Sprintf("%02d.%02d", int(d.Month()), int(d.Day())),
					}
					for _, p := range patterns {
						if strings.Contains(name, p) {
							matched = true
							break
						}
					}
					if matched { break }
				}
				if !matched {
					weekPatterns := []string{
						fmt.Sprintf("%d월%d주", monday.Month(), week),
						fmt.Sprintf("%d월 %d주", monday.Month(), week),
						fmt.Sprintf("%d월%d째주", monday.Month(), week),
						fmt.Sprintf("%d월 %d째주", monday.Month(), week),
					}
					for _, p := range weekPatterns {
						if strings.Contains(name, p) {
							matched = true
							break
						}
					}
				}

				if matched {
					currentIndex = len(pdfBase64s)
				}
				pdfBase64s = append(pdfBase64s, base64.StdEncoding.EncodeToString(pdfData))
			}
		}
	}

	// Trigger background sync if there are pending jobs
	if len(jobs) > 0 {
		go func() {
			hwpSyncMutex.Lock()
			if hwpSyncActive {
				hwpSyncMutex.Unlock()
				return
			}
			hwpSyncActive = true
			hwpSyncMutex.Unlock()

			defer func() {
				hwpSyncMutex.Lock()
				hwpSyncActive = false
				hwpSyncMutex.Unlock()
			}()

			for _, job := range jobs {
				if err := convertHWPtoPDF(job.hwpPath, job.pdfPath); err == nil {
					// Once a single file is successfully converted, emit an event so the frontend refreshes
					if ctx != nil {
						runtime.EventsEmit(ctx, "settingsChanged") // Using existing event to force dashboard reload
					}
				} else {
					if ctx != nil {
						runtime.LogError(ctx, fmt.Sprintf("Failed to background convert %s: %v", job.name, err))
					}
				}
				// Give OS / COM engine a tiny breather before the next file
				time.Sleep(1 * time.Second)
			}
		}()
	}

	if len(pdfBase64s) == 0 && len(jobs) > 0 {
		return nil, 0, true, fmt.Errorf("전체 변환 중입니다.") // Keep message short, UI will show spinner
	}

	if len(pdfBase64s) == 0 {
		return nil, 0, len(jobs) > 0, fmt.Errorf("폴더에 HWP 파일이 없거나 변환된 파일이 없습니다.")
	}

	if currentIndex == -1 {
		currentIndex = len(pdfBase64s) - 1
	}

	return pdfBase64s, currentIndex, len(jobs) > 0, nil
}

// weekOfMonth returns the week number within the month (1-based).
func weekOfMonth(t time.Time) int {
	firstDay := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
	firstWeekday := int(firstDay.Weekday())
	if firstWeekday == 0 {
		firstWeekday = 7
	}
	return (t.Day()+firstWeekday-2)/7 + 1
}

// convertHWPtoPDF converts an HWP file to PDF using Hancom Office COM automation.
// Includes safe Open/Close handling and Clear(1) to avoid NullReferenceException on quit.
func convertHWPtoPDF(hwpPath, pdfPath string) error {
	psScript := `
param([string]$HwpPath, [string]$PdfPath)
$ErrorActionPreference = 'Stop'
$hwp = $null

$progIds = @(
    'HWPFrame.HwpObject.1',
    'HWPFrame.HwpObject',
    'Hwp.HwpObject.1',
    'Hwp.HwpObject'
)
foreach ($id in $progIds) {
    try {
        $hwp = New-Object -ComObject $id -ErrorAction Stop
        break
    } catch {}
}

if ($null -eq $hwp) {
    Write-Error "한컴 HWP COM 객체를 찾을 수 없습니다."
    exit 1
}

try {
    try { $hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule") | Out-Null } catch {}

    $opened = $hwp.Open($HwpPath, "HWP", "forceopen:true")
    if (-not $opened) {
        Write-Error "파일 열기 실패: $HwpPath"
        try { 
            $hwp.Clear(1) | Out-Null
            $hwp.Quit() 
        } catch {}
        exit 1
    }

    $saved = $false

    # Method 1: HAction API (Most Reliable)
    try {
        $pset = $hwp.HParameterSet.HFileSaveAs
        $hwp.HAction.GetDefault("FileSaveAs_S", $pset) | Out-Null
        $pset.SetItem("FileName", $PdfPath)
        $pset.SetItem("Format", "PDF")  # Sometimes works
        $hwp.HAction.Execute("FileSaveAs_S", $pset) | Out-Null
    } catch {}
    
    if (-not (Test-Path $PdfPath)) {
        try {
            $pset = $hwp.HParameterSet.HFileSaveAs
            $hwp.HAction.GetDefault("FileSaveAs_S", $pset) | Out-Null
            $pset.SetItem("FileName", $PdfPath)
            # Omit Format - HWP infers from .pdf extension
            $hwp.HAction.Execute("FileSaveAs_S", $pset) | Out-Null
        } catch {}
    }
    
    if (Test-Path $PdfPath) { $saved = $true }

    # Method 2: SaveAs 3-argument
    if (-not $saved) {
        try {
            $hwp.SaveAs($PdfPath, "PDF", "") | Out-Null
            if (Test-Path $PdfPath) { $saved = $true }
        } catch {}
    }

    # Method 3: SaveAs 2-argument
    if (-not $saved) {
        try {
            $hwp.SaveAs($PdfPath, "PDF") | Out-Null
            if (Test-Path $PdfPath) { $saved = $true }
        } catch {}
    }

    try { 
        $hwp.Clear(1) | Out-Null
        Start-Sleep -Milliseconds 200
        $hwp.Quit() 
    } catch {}

    if (-not $saved) {
        Write-Error "모든 PDF 저장 방법이 실패했습니다."
        exit 1
    }
} catch {
    try { 
        $hwp.Clear(1) | Out-Null
        Start-Sleep -Milliseconds 200
        $hwp.Quit() 
    } catch {}
    Write-Error "변환 오류: $($_.Exception.Message)"
    exit 1
}
`

	tmpScript := filepath.Join(os.TempDir(), fmt.Sprintf("walle_hwp_%d.ps1", time.Now().UnixNano()))
	bom := []byte{0xEF, 0xBB, 0xBF}
	content := append(bom, []byte(psScript)...)
	if err := os.WriteFile(tmpScript, content, 0644); err != nil {
		return fmt.Errorf("임시 스크립트 생성 실패: %w", err)
	}
	defer os.Remove(tmpScript)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(
		ctx,
		"powershell",
		"-STA",
		"-NoProfile",
		"-NonInteractive",
		"-ExecutionPolicy", "Bypass",
		"-File", tmpScript,
		"-HwpPath", hwpPath,
		"-PdfPath", pdfPath,
	)
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		return fmt.Errorf("%s\n출력: %s", err.Error(), output)
	}
	return nil
}
