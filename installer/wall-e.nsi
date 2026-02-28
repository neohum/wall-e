; Wall-E NSIS Installer Script
; Electrobun installs to: %LOCALAPPDATA%\com.wall-e.school-dashboard\stable\app\
; This NSIS wrapper:
;   1. Extracts Electrobun's Wall-E-Setup.exe
;   2. Runs it to install the actual app
;   3. Creates Start Menu & Desktop shortcuts pointing to the real launcher

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ===== App Info =====
!define APP_NAME      "Wall-E"
!define APP_VERSION   "1.0.0"
!define APP_PUBLISHER "neohum"
!define APP_ID        "com.wall-e.school-dashboard"
!define APP_EXE       "launcher.exe"
!define REAL_INSTDIR  "$LOCALAPPDATA\${APP_ID}\stable\app"
!define UNINSTALL_EXE "$LOCALAPPDATA\${APP_ID}\Uninstall.exe"
!define UNINSTALL_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

; ===== General =====
Name "${APP_NAME} ${APP_VERSION}"
OutFile "Wall-E-${APP_VERSION}-Setup.exe"
InstallDir "$TEMP\Wall-E-Installer-Tmp"
RequestExecutionLevel user
Unicode true
SetCompressor /SOLID lzma

; ===== Icon =====
Icon "..\assets\icon.ico"
!define MUI_ICON   "..\assets\icon.ico"
!define MUI_UNICON "..\assets\icon.ico"

; ===== Pages =====
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN          "${REAL_INSTDIR}\bin\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT     "${APP_NAME} 실행"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ===== Language =====
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"

; ===== Install Section =====
Section "Install"
  ; Drop Electrobun's self-extracting installer into temp
  SetOutPath "$TEMP\Wall-E-Installer-Tmp"
  File /oname=Wall-E-Setup.exe "..\build\stable-win-x64\Wall-E-Setup.exe"

  ; Run Electrobun installer (it installs to %LOCALAPPDATA%\com.wall-e.school-dashboard\...)
  DetailPrint "Wall-E 설치 중..."
  ExecWait '"$TEMP\Wall-E-Installer-Tmp\Wall-E-Setup.exe"' $0
  DetailPrint "Electrobun 설치 완료 (exit=$0)"

  ; Clean up temp
  Delete "$TEMP\Wall-E-Installer-Tmp\Wall-E-Setup.exe"
  RMDir  "$TEMP\Wall-E-Installer-Tmp"

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" \
    "${REAL_INSTDIR}\bin\${APP_EXE}" "" \
    "${REAL_INSTDIR}\Resources\app.ico"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME} 제거.lnk" \
    "${REAL_INSTDIR}\Wall-E_uninstall.reg"

  ; Create Desktop shortcut
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" \
    "${REAL_INSTDIR}\bin\${APP_EXE}" "" \
    "${REAL_INSTDIR}\Resources\app.ico"

  ; Write uninstaller EXE
  WriteUninstaller "${UNINSTALL_EXE}"

  ; Write our own uninstaller entry (shortcuts only — real files managed by Electrobun)
  WriteRegStr HKCU "${UNINSTALL_REG}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_REG}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_REG}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINSTALL_REG}" "DisplayIcon"     "${REAL_INSTDIR}\Resources\app.ico"
  WriteRegStr HKCU "${UNINSTALL_REG}" "InstallLocation" "${REAL_INSTDIR}"
  WriteRegStr HKCU "${UNINSTALL_REG}" "UninstallString" '"${UNINSTALL_EXE}"'
  WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_REG}" "NoRepair"  1
SectionEnd

; ===== Uninstall Section =====
Section "Uninstall"
  ; Remove shortcuts
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME} 제거.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  ; Remove registry key
  DeleteRegKey HKCU "${UNINSTALL_REG}"

  ; Remove Electrobun app files
  RMDir /r "${REAL_INSTDIR}"

  ; Remove uninstaller itself
  Delete "${UNINSTALL_EXE}"
SectionEnd
