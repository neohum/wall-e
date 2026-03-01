import { BrowserWindow, BrowserView, ApplicationMenu, Tray, Utils, Updater } from "electrobun/bun";
import { join, basename, extname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dlopen, FFIType, JSCallback } from "bun:ffi";
import { createAutoUpdater, type UpdateCheckResult } from "./updater";
import { fetchAllDashboardData, type DashboardData } from "../dashboard/api.ts";


// ===== Settings JSON File Management =====

interface Settings {
  schoolName: string;
  schoolCode: string;
  officeCode: string;
  grade: number;
  classNum: number;
  latitude: number;
  longitude: number;
  spreadsheetUrl: string;
  alarmEnabled: boolean;
  alarmSound: string;
  customAlarmData: string;
  customAlarmName: string;
  backgroundId: string;
}

const DEFAULT_SETTINGS: Settings = {
  schoolName: "",
  schoolCode: "",
  officeCode: "",
  grade: 0,
  classNum: 0,
  latitude: 0,
  longitude: 0,
  spreadsheetUrl: "",
  alarmEnabled: true,
  alarmSound: "classic",
  customAlarmData: "",
  customAlarmName: "",
  backgroundId: "",
};

// Store settings.json in %APPDATA%/Wall-E/ so it survives rebuilds
const SETTINGS_DIR = join(process.env.APPDATA || join(import.meta.dir, "..", "data"), "Wall-E");
const SETTINGS_PATH = join(SETTINGS_DIR, "settings.json");


function readSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(settings: Settings): void {
  try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write settings:", err);
  }
}


// ===== Auto-start (Windows Startup folder shortcut via PowerShell) =====
const STARTUP_FOLDER = join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
const SHORTCUT_PATH = join(STARTUP_FOLDER, "Wall-E.lnk");
const LAUNCHER_PATH = join(import.meta.dir, "..", "..", "bin", "launcher.exe");

function getAutoStartEnabled(): boolean {
  return existsSync(SHORTCUT_PATH);
}

async function setAutoStart(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      // Create .lnk shortcut using PowerShell COM object
      const ps = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${SHORTCUT_PATH.replace(/'/g, "''")}'); $s.TargetPath = '${LAUNCHER_PATH.replace(/'/g, "''")}'; $s.WorkingDirectory = '${join(import.meta.dir, "..", "..", "bin").replace(/'/g, "''")}'; $s.Description = 'Wall-E School Dashboard'; $s.Save()`;
      const proc = Bun.spawn(["powershell.exe", "-NoProfile", "-Command", ps], { stdio: ["ignore", "ignore", "ignore"] });
      await proc.exited;
    } else {
      const { unlinkSync } = await import("node:fs");
      if (existsSync(SHORTCUT_PATH)) {
        unlinkSync(SHORTCUT_PATH);
      }
    }
  } catch (err) {
    console.warn("[autostart] error:", err);
  }
}

// Register on first run (async, fire-and-forget)
if (!getAutoStartEnabled()) {
  setAutoStart(true);
}

// ===== NEIS API key (build-time injected) =====
const ENV_NEIS_API_KEY: string = process.env.NEIS_API_KEY ?? "";

// Type for dashboard window RPC
type WindowRPC = {
  bun: {
    requests: {
      minimizeWindow: { params: undefined; response: void };
      maximizeWindow: { params: undefined; response: void };
      closeWindow: { params: undefined; response: void };
      openSettings: { params: undefined; response: void };
      getSettings: { params: undefined; response: Settings & { neisApiKey: string; appVersion: string } };
      checkForUpdate: { params: undefined; response: UpdateCheckResult };
      applyUpdate: { params: undefined; response: void };
      fetchDashboardData: { params: undefined; response: DashboardData };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      settingsChanged: Settings & { neisApiKey: string; appVersion: string };
      updateAvailable: { version: string; downloadUrl: string };
    };
  };
};

// School search result type
interface SchoolSearchResult {
  schoolCode: string;
  officeCode: string;
  schoolName: string;
  address?: string;
}

// Type for settings window RPC
type SettingsRPC = {
  bun: {
    requests: {
      closeSettings: { params: undefined; response: void };
      getSettings: { params: undefined; response: Settings & { neisApiKey: string; appVersion: string } };
      saveSettings: { params: Settings; response: void };
      pickAlarmFile: { params: undefined; response: { data: string; name: string } | null };
      getAutoStart: { params: undefined; response: boolean };
      setAutoStart: { params: { enabled: boolean }; response: void };
      searchSchool: { params: { schoolName: string }; response: SchoolSearchResult[] };
      geocodeAddress: { params: { address: string }; response: { lat: number; lon: number } | null };
      checkForUpdate: { params: undefined; response: UpdateCheckResult };
      applyUpdate: { params: undefined; response: void };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
};

// App menu
ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit", role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Settings",
        action: "open-settings",
      },
      { type: "separator" },
      {
        label: "Toggle DevTools",
        accelerator: "F12",
        action: "toggle-devtools",
      },
    ],
  },
]);

ApplicationMenu.on("application-menu-clicked", (event: any) => {
  const action = event?.data?.action;
  switch (action) {
    case "open-settings":
      openSettings();
      break;
    case "toggle-devtools":
      mainWindow.webview.toggleDevTools();
      break;
  }
});

// Helper to get settings with API key and version attached
function getSettingsWithKey(): Settings & { neisApiKey: string; appVersion: string } {
  return { ...readSettings(), neisApiKey: ENV_NEIS_API_KEY, appVersion: APP_VERSION };
}

// ===== Auto-Updater =====
const APP_VERSION = "1.0.0"; // Kept in sync with electrobun.config.ts and package.json

const autoUpdater = createAutoUpdater({
  owner: "neohum",
  repo: "wall-e",
  currentVersion: APP_VERSION,
  onUpdateAvailable: (result) => {
    console.log(`[updater] Update available: v${result.latestVersion}`);
    try {
      mainWindow.webview.rpc.send.updateAvailable({
        version: result.latestVersion,
        downloadUrl: result.downloadUrl ?? "",
      });
    } catch (err) {
      console.warn("[updater] Failed to notify webview:", err);
    }
  },
});

// Start periodic update checks (1 hour interval, initial check after 30s handled internally)
autoUpdater.startPeriodicCheck(60 * 60 * 1000);
console.log(`[updater] Auto-update checker started (current: v${APP_VERSION})`);

// Define RPC for window controls
const dashboardRPC = BrowserView.defineRPC<WindowRPC>({
  handlers: {
    requests: {
      minimizeWindow: () => {
        mainWindow.minimize();
      },
      maximizeWindow: () => {
        mainWindow.maximize();
      },
      closeWindow: () => {
        mainWindow.close();
      },
      openSettings: () => {
        openSettings();
      },
      getSettings: () => {
        return getSettingsWithKey();
      },
      checkForUpdate: async () => {
        return await autoUpdater.checkForUpdate();
      },
      applyUpdate: async () => {
        console.log("[updater] User requested update, downloading...");
        try {
          await autoUpdater.downloadAndApply();
        } catch (err) {
          console.error("[updater] Update failed:", err);
        }
      },
      fetchDashboardData: async () => {
        const settings = getSettingsWithKey();
        return await fetchAllDashboardData(settings);
      },
    },
  },
});

// Main dashboard window (frameless + transparent for rounded corners)
const mainWindow = new BrowserWindow({
  title: `Wall-E 학교 대시보드 v${APP_VERSION}`,
  url: "views://dashboard/index.html",
  frame: { x: 100, y: 50, width: 1280, height: 960 },
  titleBarStyle: "hidden",
  transparent: true,
  rpc: dashboardRPC,
});

// ===== Taskbar Icon =====
// Set the window icon via Windows API (WM_SETICON) since Electrobun doesn't do this.
const user32 = dlopen("user32.dll", {
  SendMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
  LoadImageW: { args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.ptr },
  EnumWindows: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
  IsWindowVisible: { args: [FFIType.ptr], returns: FFIType.bool },
});

const kernel32 = dlopen("kernel32.dll", {
  GetCurrentProcessId: { args: [], returns: FFIType.u32 },
});

const WM_SETICON = 0x0080;
const ICON_BIG = 1;
const ICON_SMALL = 0;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;

function toWideString(str: string): Buffer {
  const buf = Buffer.alloc((str.length + 1) * 2);
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt16LE(str.charCodeAt(i), i * 2);
  }
  return buf;
}

function applyIconToAllWindows(): void {
  try {
    const iconPath = join(import.meta.dir, "..", "views", "icon.ico");
    if (!existsSync(iconPath)) {
      console.warn("[icon] not found:", iconPath);
      return;
    }

    const iconPathW = toWideString(iconPath);
    const hIconBig = user32.symbols.LoadImageW(null, iconPathW, IMAGE_ICON, 48, 48, LR_LOADFROMFILE);
    const hIconSmall = user32.symbols.LoadImageW(null, iconPathW, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);

    if (!hIconBig && !hIconSmall) {
      console.warn("[icon] LoadImageW failed for:", iconPath);
      return;
    }

    const myPid = kernel32.symbols.GetCurrentProcessId();
    const pidBuf = new Uint32Array(1);
    let count = 0;

    const callback = new JSCallback(
      (hwnd: any, _lParam: any) => {
        user32.symbols.GetWindowThreadProcessId(hwnd, pidBuf);
        if (pidBuf[0] === myPid && user32.symbols.IsWindowVisible(hwnd)) {
          if (hIconBig) user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_BIG as any, hIconBig);
          if (hIconSmall) user32.symbols.SendMessageW(hwnd, WM_SETICON, ICON_SMALL as any, hIconSmall);
          count++;
        }
        return 1; // TRUE = continue enumeration
      },
      { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    );

    user32.symbols.EnumWindows(callback.ptr, null);
    console.log(`[icon] applied to ${count} window(s)`);
  } catch (err) {
    console.warn("[icon] error:", err);
  }
}

setTimeout(applyIconToAllWindows, 1500);

// ===== System Tray =====
const tray = new Tray({
  title: "Wall-E",
  image: "views://icon.ico",
  template: false,
  width: 32,
  height: 32,
});

tray.setMenu([
  {
    label: "Wall-E 대시보드 열기",
    action: "open-dashboard",
  },
  { type: "separator" },
  {
    label: "설정",
    action: "open-settings",
  },
  { type: "separator" },
  {
    label: "종료",
    action: "quit",
  },
]);

tray.on("tray-clicked", (event: any) => {
  const action = event?.data?.action;
  switch (action) {
    case "open-dashboard":
      mainWindow.focus();
      break;
    case "open-settings":
      openSettings();
      break;
    case "quit":
      tray.remove();
      mainWindow.close();
      process.exit(0);
      break;
    default:
      // Tray icon click (no specific action)
      mainWindow.focus();
      break;
  }
});

// ===== Settings Window =====
let settingsWindow: BrowserWindow | null = null;

function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const settingsRPC = BrowserView.defineRPC<SettingsRPC>({
    handlers: {
      requests: {
        closeSettings: () => {
          settingsWindow?.close();
        },
        getSettings: () => {
          return getSettingsWithKey();
        },
        saveSettings: (settings: Settings) => {
          writeSettings(settings);
          // Notify dashboard webview of settings change
          mainWindow.webview.rpc.send.settingsChanged(getSettingsWithKey());
        },
        getAutoStart: () => {
          return getAutoStartEnabled();
        },
        setAutoStart: async (params: { enabled: boolean }) => {
          await setAutoStart(params.enabled);
        },
        pickAlarmFile: async () => {
          const paths = await Utils.openFileDialog({
            allowedFileTypes: "*.mp3,*.wav,*.ogg,*.m4a,*.webm",
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
          });
          if (!paths || paths.length === 0) return null;

          const filePath = paths[0];
          const name = basename(filePath);
          const ext = extname(filePath).toLowerCase().replace(".", "");
          const mimeMap: Record<string, string> = {
            mp3: "audio/mpeg",
            wav: "audio/wav",
            ogg: "audio/ogg",
            m4a: "audio/mp4",
            webm: "audio/webm",
          };
          const mime = mimeMap[ext] || "audio/mpeg";

          try {
            const bytes = readFileSync(filePath);
            const base64 = Buffer.from(bytes).toString("base64");
            return { data: `data:${mime};base64,${base64}`, name };
          } catch {
            return null;
          }
        },
        searchSchool: async (params: { schoolName: string }): Promise<SchoolSearchResult[]> => {
          const apiKey = ENV_NEIS_API_KEY;
          const schoolName = params.schoolName;
          if (!apiKey || !schoolName) return [];
          try {
            const url = `https://open.neis.go.kr/hub/schoolInfo?KEY=${apiKey}&SCHUL_NM=${encodeURIComponent(schoolName)}&Type=json`;
            const res = await fetch(url);
            if (!res.ok) {
              console.warn(`[searchSchool] NEIS API HTTP ${res.status}`);
              return [];
            }
            const data = await res.json();
            const rows = data?.schoolInfo?.[1]?.row;
            if (!Array.isArray(rows)) return [];
            return rows.map((row: any) => ({
              schoolCode: row.SD_SCHUL_CODE,
              officeCode: row.ATPT_OFCDC_SC_CODE,
              schoolName: row.SCHUL_NM,
              address: row.ORG_RDNMA || "",
            }));
          } catch (err) {
            console.error("[searchSchool] error:", err);
            return [];
          }
        },
        geocodeAddress: async (params: { address: string }): Promise<{ lat: number; lon: number } | null> => {
          try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(params.address)}&format=json&limit=1&countrycodes=kr`;
            const res = await fetch(url, {
              headers: { "Accept-Language": "ko", "User-Agent": "Wall-E-SchoolDashboard/1.0" },
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) return null;
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
          } catch (err) {
            console.error("[geocode] error:", err);
            return null;
          }
        },
        checkForUpdate: async () => {
          return await autoUpdater.checkForUpdate();
        },
        applyUpdate: async () => {
          console.log("[updater] User requested update from settings");
          try {
            await autoUpdater.downloadAndApply();
          } catch (err) {
            console.error("[updater] Update failed:", err);
          }
        },
      },
    },
  });

  settingsWindow = new BrowserWindow({
    title: "설정 - Wall-E",
    url: "views://settings/index.html",
    frame: { x: 200, y: 200, width: 600, height: 700 },
    titleBarStyle: "hidden",
    transparent: true,
    rpc: settingsRPC,
  });

  setTimeout(applyIconToAllWindows, 500);

  settingsWindow.on("close", () => {
    settingsWindow = null;
  });
}
