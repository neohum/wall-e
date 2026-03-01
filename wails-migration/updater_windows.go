//go:build windows

package main

import "syscall"

// detachedProcess returns SysProcAttr that detaches the process from the parent.
// This allows the installer to keep running after the app closes.
func detachedProcess() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    false,
	}
}
