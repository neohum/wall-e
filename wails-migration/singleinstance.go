package main

import (
	"syscall"
	"unsafe"
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex = kernel32.NewProc("CreateMutexW")
	user32          = syscall.NewLazyDLL("user32.dll")
	procFindWindow  = user32.NewProc("FindWindowW")
	procSetForeground = user32.NewProc("SetForegroundWindow")
	procShowWindow  = user32.NewProc("ShowWindow")
)

const (
	errorAlreadyExists = 183
	swRestore          = 9
)

// ensureSingleInstance creates a named mutex. If the mutex already exists,
// it means another instance is running — bring it to front and return false.
func ensureSingleInstance() bool {
	name, _ := syscall.UTF16PtrFromString("Global\\WallE_SchoolDashboard_Mutex")
	handle, _, err := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))

	if handle == 0 {
		return false
	}

	if errno, ok := err.(syscall.Errno); ok && errno == errorAlreadyExists {
		syscall.CloseHandle(syscall.Handle(handle))
		bringExistingToFront()
		return false
	}

	// Don't close the handle — keep the mutex alive for the process lifetime.
	return true
}

func bringExistingToFront() {
	title, _ := syscall.UTF16PtrFromString("Wall-E 학교 대시보드")
	hwnd, _, _ := procFindWindow.Call(0, uintptr(unsafe.Pointer(title)))
	if hwnd != 0 {
		procShowWindow.Call(hwnd, swRestore)
		procSetForeground.Call(hwnd)
	}
}
