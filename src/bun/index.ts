import { BrowserWindow, BrowserView, ApplicationMenu, Tray, Utils } from "electrobun/bun";
import { join, basename, extname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

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

// Store settings.json next to the executable for portability
const SETTINGS_DIR = join(import.meta.dir, "..", "data");
const SETTINGS_PATH = join(SETTINGS_DIR, "settings.json");

function readSettings(): Settings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, "utf-8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
      getSettings: { params: undefined; response: Settings & { neisApiKey: string } };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      settingsChanged: Settings & { neisApiKey: string };
    };
  };
};

// Type for settings window RPC
type SettingsRPC = {
  bun: {
    requests: {
      closeSettings: { params: undefined; response: void };
      getSettings: { params: undefined; response: Settings & { neisApiKey: string } };
      saveSettings: { params: Settings; response: void };
      pickAlarmFile: { params: undefined; response: { data: string; name: string } | null };
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
        action: () => {
          openSettings();
        },
      },
      { type: "separator" },
      {
        label: "Toggle DevTools",
        accelerator: "F12",
        action: () => {
          mainWindow.webview.toggleDevTools();
        },
      },
    ],
  },
]);

// Helper to get settings with API key attached
function getSettingsWithKey(): Settings & { neisApiKey: string } {
  return { ...readSettings(), neisApiKey: ENV_NEIS_API_KEY };
}

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
    },
  },
});

// Main dashboard window (frameless + transparent for rounded corners)
const mainWindow = new BrowserWindow({
  title: "Wall-E 학교 대시보드",
  url: "views://dashboard/index.html",
  frame: { x: 100, y: 100, width: 1280, height: 800 },
  titleBarStyle: "hidden",
  transparent: true,
  rpc: dashboardRPC,
});

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
    action: () => {
      mainWindow.focus();
    },
  },
  { type: "separator" },
  {
    label: "설정",
    action: () => {
      openSettings();
    },
  },
  { type: "separator" },
  {
    label: "종료",
    action: () => {
      tray.remove();
      mainWindow.close();
      process.exit(0);
    },
  },
]);

tray.on("tray-clicked", () => {
  mainWindow.focus();
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

  settingsWindow.on("close", () => {
    settingsWindow = null;
  });
}
