package main

import (
	_ "embed"

	"github.com/getlantern/systray"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/tray-icon.ico
var trayIcon []byte

func (a *App) setupTray() {
	go systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("Wall-E")
		systray.SetTooltip("Wall-E 학교 대시보드")

		mOpen := systray.AddMenuItem("Wall-E 대시보드 열기", "대시보드 열기")
		systray.AddSeparator()
		mSettings := systray.AddMenuItem("설정", "설정 열기")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("종료", "앱 종료")

		go func() {
			for {
				select {
				case <-mOpen.ClickedCh:
					runtime.WindowShow(a.ctx)
					runtime.WindowSetAlwaysOnTop(a.ctx, true)
					runtime.WindowSetAlwaysOnTop(a.ctx, false)
				case <-mSettings.ClickedCh:
					runtime.EventsEmit(a.ctx, "openSettings")
				case <-mQuit.ClickedCh:
					systray.Quit()
					runtime.Quit(a.ctx)
				}
			}
		}()
	}, func() {})
}
