// ===== Dashboard Logic =====
// Uses Wails bindings instead of Electrobun RPC

import 'gridstack/dist/gridstack.min.css';
import { GridStack } from 'gridstack';
import type { Settings, DashboardData, MealData, ScheduleEvent, CustomEvent as WallECustomEvent } from "../types";
import {
  getPeriods,
  getSubjects,
  getHeaders,
  getCurrentPeriodStatus,
  renderTimetable,
  getStatusBadgeClass,
} from "./schedule";
import {
  checkAndPlayAlarms,
  checkAndPlayHourlyChime,
  checkAndPlayCustomEventAlarms,
  resetAlarmsIfNewDay,
  type AlarmEvent,
  type CustomAlarmEvent
} from "./audio";
import {
  formatDate,
  formatTime,
  formatDateCompact,
  isToday,
  getTodayStr,
  $,
} from "./utils";
import { initTimer } from "./timer";

// Weather code to emoji map (moved from Go backend since it's display logic)
const WEATHER_CODE_MAP: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  56: "🌨️", 57: "🌨️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌨️", 67: "🌨️",
  71: "❄️", 73: "❄️", 75: "❄️", 77: "❄️",
  80: "🌦️", 81: "🌧️", 82: "🌧️",
  85: "❄️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function getWeatherIcon(code: number): string {
  return WEATHER_CODE_MAP[code] ?? "🌡️";
}

type PMLevel = "good" | "moderate" | "unhealthy" | "very-unhealthy";

function getPMLevel(value: number, type: "pm10" | "pm25"): PMLevel {
  if (type === "pm10") {
    if (value <= 30) return "good";
    if (value <= 80) return "moderate";
    if (value <= 150) return "unhealthy";
    return "very-unhealthy";
  }
  if (value <= 15) return "good";
  if (value <= 35) return "moderate";
  if (value <= 75) return "unhealthy";
  return "very-unhealthy";
}

function getPMLevelLabel(level: PMLevel): string {
  const labels: Record<PMLevel, string> = {
    "good": "좋음",
    "moderate": "보통",
    "unhealthy": "나쁨",
    "very-unhealthy": "매우나쁨",
  };
  return labels[level];
}

// ===== State =====
let dashboardData: DashboardData | null = null;
let cachedSettings: Settings | null = null;
let cachedCustomEvents: WallECustomEvent[] = [];
let lastFetchTime = 0;
const FETCH_INTERVAL = 30 * 60 * 1000;

function getSettings(): Settings {
  return cachedSettings ?? {
    schoolName: "",
    schoolCode: "",
    officeCode: "",
    grade: 0,
    classNum: 0,
    latitude: 0,
    longitude: 0,
    useCustomApiKey: false,
    customApiKey: "",
    alarmEnabled: true,
    alarmSound: "classic",
    customAlarmData: "",
    customAlarmName: "",
    timeAnnouncement: false,
    panelOpacity: 0.5,
    backgroundId: "",
    customBackgrounds: [],
    studyPlanFolder: "",
    eventAlarmEnabled: true,
    eventAlarmSound: "classic",
  };
}

// ===== Wails Bindings =====
declare global {
  interface Window {
    go: {
      main: {
        App: {
          GetSettings(): Promise<Settings>;
          SaveSettings(s: Settings): Promise<void>;
          FetchDashboardData(): Promise<DashboardData>;
          SearchSchool(name: string): Promise<{ schools: any[]; error: string }>;
          GeocodeAddress(addr: string): Promise<any>;
          PickAlarmFile(): Promise<any>;
          PickBackgroundFile(): Promise<any>;
          GetCustomBackgroundURL(id: string): Promise<string>;
          RemoveCustomBackground(id: string): Promise<void>;
          GetAutoStart(): Promise<boolean>;
          SetAutoStart(enabled: boolean): Promise<void>;
          MinimizeWindow(): Promise<void>;
          MaximizeWindow(): Promise<void>;
          CloseWindow(): Promise<void>;
          GetNeisAPIKey(): Promise<string>;
          GetAppVersion(): Promise<string>;
          CheckForUpdate(): Promise<any>;
          DownloadAndRunUpdate(url: string): Promise<string>;
          OpenDownloadURL(url: string): Promise<void>;
          GetCustomEvents(): Promise<WallECustomEvent[]>;
          AddCustomEvent(e: WallECustomEvent): Promise<void>;
          UpdateCustomEvent(e: WallECustomEvent): Promise<void>;
          DeleteCustomEvent(id: string): Promise<void>;
          PickStudyPlanFolder(): Promise<string>;
          GetCustomTimetableTimes(): Promise<import("../types").PeriodTime[]>;
          SaveCustomTimetableTimes(periods: import("../types").PeriodTime[]): Promise<void>;
        };
      };
    };
    runtime: {
      EventsOn(event: string, callback: (...args: any[]) => void): void;
      EventsOff(event: string): void;
    };
  }
}

let editingEventId: string | null = null;

// ===== Initialization =====

let grid: GridStack | null = null;
const LAYOUT_KEY = 'wall-e-dashboard-layout';

function initGridLayout(): void {
  grid = GridStack.init({
    cellHeight: 80,
    margin: 16,
    animate: true,
  }, '#dashboardContent');

  const savedLayout = localStorage.getItem(LAYOUT_KEY);
  if (savedLayout) {
    try {
      const layout = JSON.parse(savedLayout);
      grid.load(layout, false); // false prevents removing new DOM elements not in saved layout
    } catch (e) {
      console.error('Failed to load layout from localStorage', e);
    }
  }

  grid.on('change', () => {
    if (!grid) return;
    const layout = grid.save(false);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  });

  setupPanelControls();
}

function setupPanelControls() {
  if (!grid) return;
  document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector('.panel__header');
    if (!header) return;
    
    const minBtn = document.createElement('button');
    minBtn.className = 'btn-minimize-panel';
    minBtn.title = '최소화';
    minBtn.innerHTML = '−'; // minus sign
    
    // Style the button
    minBtn.style.background = 'none';
    minBtn.style.border = 'none';
    minBtn.style.color = 'var(--text-secondary)';
    minBtn.style.fontSize = '1.2rem';
    minBtn.style.fontWeight = 'bold';
    minBtn.style.cursor = 'pointer';
    minBtn.style.padding = '0 5px';
    minBtn.style.marginLeft = 'auto'; // push to right

    header.appendChild(minBtn);
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gridItem = panel.closest('.grid-stack-item') as HTMLElement;
      if (!gridItem) return;

      const body = panel.querySelector('.panel__body') as HTMLElement;
      if (!body) return;

      if (panel.classList.contains('minimized')) {
        // Restore
        panel.classList.remove('minimized');
        body.style.display = '';
        const oldH = gridItem.dataset.prevH || gridItem.getAttribute('gs-min-h') || '3';
        const oldMinH = gridItem.dataset.prevMinH || '3';
        grid!.update(gridItem, { h: parseInt(oldH), minH: parseInt(oldMinH) });
        minBtn.innerHTML = '−';
        minBtn.title = '최소화';
      } else {
        // Minimize
        panel.classList.add('minimized');
        gridItem.dataset.prevH = gridItem.getAttribute('gs-h') || '3';
        gridItem.dataset.prevMinH = gridItem.getAttribute('gs-min-h') || '3';
        body.style.display = 'none';
        grid!.update(gridItem, { h: 1, minH: 1 });
        minBtn.innerHTML = '＋';
        minBtn.title = '최대화';
      }
    });

    // Check if it was loaded as minimized (h===1)
    const gridItem = panel.closest('.grid-stack-item');
    if (gridItem && gridItem.getAttribute('gs-h') === '1') {
      panel.classList.add('minimized');
      const body = panel.querySelector('.panel__body') as HTMLElement;
      if (body) body.style.display = 'none';
      minBtn.innerHTML = '＋';
      minBtn.title = '최대화';
    }
  });
}

export async function initDashboard(): Promise<void> {
  cachedSettings = await window.go.main.App.GetSettings();

  setupWindowControls();
  updateHeader();
  updateAppVersion();
  applyBackground(cachedSettings);
  updateClock();
  initGridLayout();
  await loadDashboardData();
  startUpdateLoop();

  // Add Timetable Time Edit handlers
  const editTimeBtn = document.getElementById("btnEditTimetableTime");
  const editTimeOverlay = document.getElementById("editTimeOverlay");
  const closeEditTimeBtn = document.getElementById("btnCloseEditTime");
  const saveEditTimeBtn = document.getElementById("btnSaveEditTime");
  const addPeriodBtn = document.getElementById("btnAddPeriod");

  if (addPeriodBtn) {
    addPeriodBtn.addEventListener("click", () => {
      const items = document.getElementById("editTimeList")?.querySelectorAll(".edit-time-item");
      let nextStart = "";
      let nextEnd = "";
      if (items && items.length > 0) {
          const lastEnd = (items[items.length - 1].querySelector('.end-input') as HTMLInputElement).value;
          if (lastEnd) {
             const [h, m] = lastEnd.split(':').map(Number);
             const startM = (m + 10) % 60;
             const startH = h + Math.floor((m + 10) / 60);
             const endM = (startM + 40) % 60;
             const endH = startH + Math.floor((startM + 40) / 60);
             
             nextStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
             nextEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          }
      }
      addPeriodRow(nextStart, nextEnd);
    });
  }

  if (editTimeBtn && editTimeOverlay) {
    editTimeBtn.addEventListener("click", () => {
      editTimeOverlay.classList.add("open");
      renderEditTimeList();
    });
  }

  if (closeEditTimeBtn && editTimeOverlay) {
    closeEditTimeBtn.addEventListener("click", () => editTimeOverlay.classList.remove("open"));
  }

  if (editTimeOverlay) {
    editTimeOverlay.addEventListener("click", (e) => {
      if (e.target === editTimeOverlay) editTimeOverlay.classList.remove("open");
    });
  }

  if (saveEditTimeBtn) {
    saveEditTimeBtn.addEventListener("click", async () => {
      const listDiv = document.getElementById("editTimeList");
      if (!listDiv) return;

      const items = listDiv.querySelectorAll(".edit-time-item");
      const newPeriods: import("../types").PeriodTime[] = [];

      let periodIndex = 1;
      items.forEach((item) => {
        const start = (item.querySelector(".start-input") as HTMLInputElement).value;
        const end = (item.querySelector(".end-input") as HTMLInputElement).value;
        if (start && end) {
          newPeriods.push({ period: periodIndex++, start, end });
        }
      });

      try {
        await window.go.main.App.SaveCustomTimetableTimes(newPeriods);
        editTimeOverlay?.classList.remove("open");
        await loadDashboardData(); // Re-fetch dashboard data to apply new times
      } catch (err) {
        console.error("Failed to save custom timetable times:", err);
        alert("시간표 시간 수정에 실패했습니다.");
      }
    });
  }

  // Add Event Overlay handlers
  const openEventBtn = document.getElementById("btnAddEvent");
  const addEventOverlay = document.getElementById("addEventOverlay");
  const closeEventBtn = document.getElementById("btnCloseAddEvent");
  const saveEventBtn = document.getElementById("btnSaveEvent");

  if (openEventBtn && addEventOverlay) {
    openEventBtn.addEventListener("click", () => {
      editingEventId = null;
      addEventOverlay.classList.add("open");
      (document.getElementById("eventNameInput") as HTMLInputElement).value = "";
      (document.getElementById("eventDateInput") as HTMLInputElement).value = new Date().toISOString().split('T')[0];
      (document.getElementById("eventTimeInput") as HTMLInputElement).value = "";
      (document.getElementById("eventAlarmCheckbox") as HTMLInputElement).checked = true;
    });
  }

  if (closeEventBtn && addEventOverlay) {
    closeEventBtn.addEventListener("click", () => addEventOverlay.classList.remove("open"));
  }
  
  if (addEventOverlay) {
    addEventOverlay.addEventListener("click", (e) => {
      if (e.target === addEventOverlay) addEventOverlay.classList.remove("open");
    });
  }

  if (saveEventBtn) {
    saveEventBtn.addEventListener("click", async () => {
      const name = (document.getElementById("eventNameInput") as HTMLInputElement).value.trim();
      const date = (document.getElementById("eventDateInput") as HTMLInputElement).value;
      const time = (document.getElementById("eventTimeInput") as HTMLInputElement).value;
      const alarmEnabled = (document.getElementById("eventAlarmCheckbox") as HTMLInputElement).checked;

      if (!name) {
        alert("행사 이름을 입력해주세요.");
        return;
      }
      if (!date) {
        alert("행사 날짜를 선택해주세요.");
        return;
      }

      const isEdit = !!editingEventId;
      const newId = isEdit ? editingEventId! : Date.now().toString(); // simple ID

      const newEvent: WallECustomEvent = {
        id: newId,
        date,
        time,
        name,
        alarmEnabled
      };

      try {
        if (isEdit) {
          await window.go.main.App.UpdateCustomEvent(newEvent);
        } else {
          await window.go.main.App.AddCustomEvent(newEvent);
        }
        
        cachedCustomEvents = await window.go.main.App.GetCustomEvents() || [];
        addEventOverlay?.classList.remove("open");
        editingEventId = null;
        updateEvents(); // Re-render
      } catch (err) {
        console.error("Failed to save custom event:", err);
        alert("행사를 저장하는데 실패했습니다.");
      }
    });
  }

  // Initialize floating timer
  initTimer();

  // Auto update check on startup
  checkForUpdateOnStartup();

  // Study plan folder button
  updateStudyPlanFolderBtn(cachedSettings.studyPlanFolder);
  document.getElementById("btnSetStudyPlanFolder")?.addEventListener("click", async () => {
    const path = await window.go.main.App.PickStudyPlanFolder();
    if (!path) return;
    const s = await window.go.main.App.GetSettings();
    s.studyPlanFolder = path;
    await window.go.main.App.SaveSettings(s);
    // settingsChanged event will reload data and update button
  });

  // Listen for settings changes from Go backend
  window.runtime.EventsOn("settingsChanged", async () => {
    cachedSettings = await window.go.main.App.GetSettings();
    updateHeader();
    applyBackground(cachedSettings);
    updateStudyPlanFolderBtn(cachedSettings.studyPlanFolder);
    loadDashboardData();
  });
}

function updateStudyPlanFolderBtn(folder: string): void {
  const btn = document.getElementById("btnSetStudyPlanFolder") as HTMLButtonElement | null;
  if (!btn) return;
  btn.style.display = folder ? "none" : "";
}

// ===== Auto Update Check =====

async function checkForUpdateOnStartup(): Promise<void> {
  try {
    const result = await window.go.main.App.CheckForUpdate();
    if (!result || !result.updateAvailable) return;

    const overlay = document.getElementById("updateOverlay");
    const versionInfo = document.getElementById("updateVersionInfo");
    const statusEl = document.getElementById("updateModalStatus");
    const btnNow = document.getElementById("btnUpdateNow") as HTMLButtonElement;
    const btnLater = document.getElementById("btnUpdateLater") as HTMLButtonElement;
    if (!overlay || !versionInfo || !statusEl || !btnNow || !btnLater) return;

    versionInfo.textContent = `v${result.currentVersion} → v${result.latestVersion}`;
    statusEl.textContent = "";
    overlay.classList.add("visible");

    const downloadURL = result.downloadURL || "";

    btnLater.addEventListener("click", () => {
      overlay.classList.remove("visible");
    });

    btnNow.addEventListener("click", async () => {
      if (!downloadURL) {
        // Fallback: open release page
        window.go.main.App.OpenDownloadURL(result.downloadURL || `https://github.com/neohum/wall-e/releases/latest`);
        overlay.classList.remove("visible");
        return;
      }

      btnNow.disabled = true;
      btnNow.textContent = "다운로드 중...";
      btnLater.style.display = "none";
      statusEl.textContent = "설치 파일을 다운로드하는 중입니다...";

      // Show progress bar and listen for progress events
      const progressEl = document.getElementById("updateProgress");
      const fillEl = document.getElementById("progressFill");
      const textEl = document.getElementById("progressText");
      if (progressEl) progressEl.style.display = "";

      const formatMB = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1) + "MB";

      window.runtime.EventsOn("downloadProgress", (percent: number, downloaded: number, total: number) => {
        if (fillEl) fillEl.style.width = percent + "%";
        if (textEl) textEl.textContent = `${percent}% \u00B7 ${formatMB(downloaded)} / ${formatMB(total)}`;
      });

      const errMsg = await window.go.main.App.DownloadAndRunUpdate(downloadURL);
      window.runtime.EventsOff("downloadProgress");

      if (errMsg) {
        statusEl.textContent = `실패: ${errMsg}`;
        btnNow.disabled = false;
        btnNow.textContent = "업데이트";
        btnLater.style.display = "";
        if (progressEl) progressEl.style.display = "none";
      } else {
        statusEl.textContent = "설치 프로그램이 실행됩니다. 잠시 후 앱이 다시 시작됩니다.";
      }
    });
  } catch {
    // Silently ignore update check failures
  }
}

// ===== Window Controls =====

function setupWindowControls(): void {
  const controls = document.querySelector(".window-controls");
  controls?.addEventListener("mousedown", (e) => e.stopPropagation());

  document.getElementById("btnMinimize")?.addEventListener("click", () => {
    window.go.main.App.MinimizeWindow();
  });
  document.getElementById("btnMaximize")?.addEventListener("click", () => {
    window.go.main.App.MaximizeWindow();
  });
  document.getElementById("btnClose")?.addEventListener("click", () => {
    window.go.main.App.CloseWindow();
  });
}

// ===== Header =====

function updateHeader(): void {
  const settings = getSettings();
  const schoolNameEl = $("#schoolName");
  const classInfoEl = $("#classInfo");

  if (schoolNameEl) schoolNameEl.textContent = settings.schoolName || "학교 대시보드";
  if (classInfoEl) {
    classInfoEl.textContent = settings.schoolCode
      ? `${settings.grade}학년 ${settings.classNum}반`
      : "설정에서 학교 정보를 입력하세요";
  }
}

// ===== App Version =====

async function updateAppVersion(): Promise<void> {
  const versionEl = $("#appVersion");
  if (!versionEl) return;
  const version = await window.go.main.App.GetAppVersion();
  if (version) {
    versionEl.textContent = `v${version}`;
  }
}

// ===== Background =====

async function applyBackground(settings: Settings): Promise<void> {
  const frame = document.querySelector(".window-frame") as HTMLElement;
  
  if (settings.panelOpacity !== undefined) {
    document.documentElement.style.setProperty("--bg-panel", `rgba(255, 255, 255, ${settings.panelOpacity})`);
    document.documentElement.style.setProperty("--bg-panel-hover", `rgba(255, 255, 255, ${Math.min(1, settings.panelOpacity + 0.15)})`);
  }

  if (!frame) return;

  if (!settings.backgroundId) {
    frame.style.removeProperty("--bg-image");
    frame.style.removeProperty("--bg-color");
    return;
  }

  if (settings.backgroundId.startsWith("color:")) {
    frame.style.removeProperty("--bg-image");
    frame.style.setProperty("--bg-color", settings.backgroundId.slice(6));
    return;
  }

  frame.style.removeProperty("--bg-color");

  if (settings.backgroundId.startsWith("custom:")) {
    const customId = settings.backgroundId.slice(7);
    const dataURL = await window.go.main.App.GetCustomBackgroundURL(customId);
    if (dataURL) {
      frame.style.setProperty("--bg-image", `url('${dataURL}')`);
    } else {
      frame.style.removeProperty("--bg-image");
    }
    return;
  }

  // Use relative path from public/assets/bg/
  const url = `/assets/bg/${settings.backgroundId}`;
  frame.style.setProperty("--bg-image", `url('${url}')`);
}


// ===== Clock =====

function updateClock(): void {
  const now = new Date();
  const dateEl = $("#currentDate");
  const timeEl = $("#currentTime");

  if (dateEl) dateEl.textContent = formatDate(now);
  if (timeEl) timeEl.textContent = formatTime(now);
}

// ===== Weather & Air Quality =====

function updateWeather(): void {
  if (!dashboardData?.weather) return;

  const w = dashboardData.weather;
  const iconEl = $("#weatherIcon");
  const tempEl = $("#weatherTemp");

  if (iconEl) iconEl.textContent = getWeatherIcon(w.weatherCode);
  if (tempEl) tempEl.textContent = `${w.temperature}°C`;
}

function updateAirQuality(): void {
  if (!dashboardData?.airQuality) return;

  const aq = dashboardData.airQuality;
  const pm10El = $("#pm10Badge");
  const pm25El = $("#pm25Badge");

  if (pm10El) {
    const level = getPMLevel(aq.pm10, "pm10");
    pm10El.textContent = `미세 ${getPMLevelLabel(level)}`;
    pm10El.className = `pm-badge ${level}`;
    pm10El.title = `미세먼지: ${Math.round(aq.pm10)}μg/m³`;
  }

  if (pm25El) {
    const level = getPMLevel(aq.pm25, "pm25");
    pm25El.textContent = `초미세 ${getPMLevelLabel(level)}`;
    pm25El.className = `pm-badge ${level}`;
    pm25El.title = `초미세먼지: ${Math.round(aq.pm25)}μg/m³`;
  }
}

// ===== Timetable =====

function updateTimetable(): void {
  const tableBody = document.getElementById("timetableBody");
  if (!tableBody) return;

  const timetable = dashboardData?.timetable ?? null;
  const periods = getPeriods(timetable);
  const subjects = getSubjects(timetable);
  const headers = getHeaders(timetable);
  const now = new Date();
  const status = getCurrentPeriodStatus(periods, now);

  const jsDay = now.getDay();
  const todayIdx = jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : -1;

  renderTimetable(tableBody, subjects, periods, status, todayIdx, headers);

  const statusEl = $("#classStatus");
  if (statusEl) {
    statusEl.textContent = status.message;
    statusEl.className = `class-status-badge ${getStatusBadgeClass(status)}`;
  }

  const weekEl = $("#timetableWeek");
  if (weekEl) {
    weekEl.textContent = formatDate(now);
  }
}

function updatePeriodLabels() {
  const container = document.getElementById("editTimeList");
  if (!container) return;
  const items = container.querySelectorAll(".edit-time-item");
  items.forEach((item, index) => {
    const label = item.querySelector(".period-label");
    if (label) label.textContent = String(index + 1);
    (item as HTMLElement).dataset.period = String(index + 1);
  });
}

function addPeriodRow(start = "", end = "") {
  const container = document.getElementById("editTimeList");
  if (!container) return;
  const item = document.createElement("div");
  item.className = "edit-time-item";
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.gap = "8px";

  item.innerHTML = `
    <div style="width:45px; font-weight:bold; font-size:0.9rem;"><span class="period-label"></span>교시</div>
    <input type="time" class="start-input" value="${start}" style="flex:1; border:1px solid rgba(0,0,0,0.1); background:rgba(255,255,255,0.7); border-radius:4px; padding:4px;">
    <span>~</span>
    <input type="time" class="end-input" value="${end}" style="flex:1; border:1px solid rgba(0,0,0,0.1); background:rgba(255,255,255,0.7); border-radius:4px; padding:4px;">
    <button class="btn-remove-period" style="background:none; border:none; color:var(--accent-red,#dc2626); cursor:pointer; font-weight:bold; padding:0 4px; font-size:1.1rem; line-height:1;" title="삭제">&times;</button>
  `;

  // Remove event
  item.querySelector('.btn-remove-period')?.addEventListener('click', () => {
    item.remove();
    updatePeriodLabels();
  });

  container.appendChild(item);
  updatePeriodLabels();
}

function renderEditTimeList() {
  const container = document.getElementById("editTimeList");
  if (!container) return;

  container.innerHTML = "";
  
  const timetable = dashboardData?.timetable;
  let periods = timetable?.periods || [];
  
  if (periods.length === 0) {
    addPeriodRow("09:00", "09:50");
    return;
  }

  periods.forEach(p => {
    addPeriodRow(p.start, p.end);
  });
}

// ===== Meals =====

function updateMeals(): void {
  const container = document.getElementById("mealsContainer");
  if (!container) return;

  const meals = dashboardData?.meals ?? [];

  if (meals.length === 0) {
    container.innerHTML = '<div class="loading-placeholder">급식 정보가 없습니다</div>';
    return;
  }

  container.innerHTML = "";
  const todayStr = getTodayStr();

  for (const meal of meals) {
    const card = document.createElement("div");
    card.className = `meal-card${meal.date === todayStr ? " today" : ""}`;

    const dateInfo = formatDateCompact(meal.date);
    const dayLabel = meal.date === todayStr ? "오늘" : `${dateInfo.dayOfWeek}요일`;

    card.innerHTML = `
      <div class="meal-card__date">
        ${dateInfo.month} ${dateInfo.day}일
        <span class="day-label">${dayLabel}</span>
        ${meal.calories ? `<span style="float:right;color:var(--text-muted);font-weight:400">${meal.calories}</span>` : ""}
      </div>
      <div class="meal-card__menu">
        ${meal.menu.map(formatMenuItem).join("<br>")}
      </div>
    `;

    container.appendChild(card);
  }
}

function formatMenuItem(item: string): string {
  return item.replace(
    /\(([0-9.]+)\)/g,
    '<span class="allergen">($1)</span>'
  );
}

// ===== Events =====

// A unified event structure for sorting and rendering
interface UnifiedEvent {
  id?: string;
  isCustom: boolean;
  date: string;
  name: string;
  detail?: string;
  time?: string;
  alarmEnabled?: boolean;
}

async function updateEvents(): Promise<void> {
  const container = document.getElementById("eventsContainer");
  if (!container) return;

  const neisEvents = dashboardData?.events ?? [];
  const customEvents = cachedCustomEvents;

  // Filter custom events conceptually to either future/current month or just include all and sort
  // For simplicity, include all since the user probably manages their own event list
  
  const unifiedEvents: UnifiedEvent[] = [
    ...neisEvents.map(e => ({ isCustom: false, date: e.date, name: e.name, detail: e.detail })),
    ...customEvents.map((e: WallECustomEvent) => ({ isCustom: true, id: e.id, date: e.date, name: e.name, time: e.time, alarmEnabled: e.alarmEnabled }))
  ];

  // Sort by date then time
  unifiedEvents.sort((a, b) => {
    const dA = a.date.replace(/-/g, "");
    const dB = b.date.replace(/-/g, "");
    const dCmp = dA.localeCompare(dB);
    if (dCmp !== 0) return dCmp;
    const tA = a.time || "";
    const tB = b.time || "";
    return tA.localeCompare(tB);
  });

  if (unifiedEvents.length === 0) {
    container.innerHTML = '<div class="loading-placeholder">예정된 행사가 없습니다</div>';
    return;
  }

  container.innerHTML = "";

  for (const event of unifiedEvents) {
    const item = document.createElement("div");
    const today = isToday(event.date);
    item.className = `event-item${today ? " today" : ""}`;
    if (event.isCustom) item.style.borderLeftColor = "var(--primary)";

    const dateInfo = formatDateCompact(event.date);

    let detailHtml = "";
    if (event.detail) detailHtml += `<div class="event-item__detail">${event.detail}</div>`;
    if (event.time) detailHtml += `<div class="event-item__detail" style="color:var(--primary);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${event.time}${event.alarmEnabled ? ' 🔔' : ''}</div>`;
    else if (event.isCustom && event.alarmEnabled) detailHtml += `<div class="event-item__detail" style="color:var(--primary);">🔔 (08:40 알림)</div>`;

    item.innerHTML = `
      <div class="event-item__date">
        <div class="event-item__month">${dateInfo.month}</div>
        <div class="event-item__day">${dateInfo.day}</div>
      </div>
      <div class="event-item__info">
        <div class="event-item__name">${event.name}</div>
        ${detailHtml}
      </div>
      ${event.isCustom ? `<button class="delete-btn" data-id="${event.id}" title="행사 삭제" style="background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:0 8px;">&times;</button>` : ""}
    `;

    if (event.isCustom) {
      item.style.cursor = "pointer";
      item.title = "클릭하여 수정";
      item.addEventListener("click", (e) => {
        // Prevent if clicking on the delete button
        if ((e.target as HTMLElement).closest('.delete-btn')) return;

        editingEventId = event.id!;
        const addEventOverlay = document.getElementById("addEventOverlay");
        if (addEventOverlay) addEventOverlay.classList.add("open");
        const nameInput = document.getElementById("eventNameInput") as HTMLInputElement;
        const dateInput = document.getElementById("eventDateInput") as HTMLInputElement;
        const timeInput = document.getElementById("eventTimeInput") as HTMLInputElement;
        const alarmCheckbox = document.getElementById("eventAlarmCheckbox") as HTMLInputElement;
        
        if (nameInput) nameInput.value = event.name;
        if (dateInput) dateInput.value = event.date;
        if (timeInput) timeInput.value = event.time || "";
        if (alarmCheckbox) alarmCheckbox.checked = event.alarmEnabled || false;
      });
    }

    container.appendChild(item);
  }

  // Bind delete handlers
  container.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation(); // Bubbling prevention
      const id = (e.currentTarget as HTMLButtonElement).dataset.id;
      if (id && confirm("이 맞춤형 행사를 삭제하시겠습니까?")) {
        try {
          await window.go.main.App.DeleteCustomEvent(id);
          cachedCustomEvents = await window.go.main.App.GetCustomEvents() || [];
          updateEvents(); // Re-render
        } catch (err) {
          console.error("Failed to delete custom event:", err);
          alert("행사 삭제에 실패했습니다.");
        }
      }
    });
  });
}

// ===== Study Plan =====

let studyPlanIndex = 0;
let studyPlanInitialLoad = true;
let studyPlanNavSetup = false;

function setupStudyPlanNav(): void {
  if (studyPlanNavSetup) return;
  studyPlanNavSetup = true;

  document.getElementById("studyPlanPrev")?.addEventListener("click", () => {
    if (dashboardData?.studyPlanSVGs && dashboardData.studyPlanSVGs.length > 0) {
      if (studyPlanIndex > 0) {
        studyPlanIndex--;
        renderStudyPlanBlock();
      }
      return;
    }

    const result = dashboardData?.studyPlan;
    if (!result || result.blocks.length === 0) return;
    if (studyPlanIndex > 0) {
      studyPlanIndex--;
      renderStudyPlanBlock();
    }
  });

  document.getElementById("studyPlanNext")?.addEventListener("click", () => {
    if (dashboardData?.studyPlanSVGs && dashboardData.studyPlanSVGs.length > 0) {
      if (studyPlanIndex < dashboardData.studyPlanSVGs.length - 1) {
        studyPlanIndex++;
        renderStudyPlanBlock();
      }
      return;
    }

    const result = dashboardData?.studyPlan;
    if (!result || result.blocks.length === 0) return;
    if (studyPlanIndex < result.blocks.length - 1) {
      studyPlanIndex++;
      renderStudyPlanBlock();
    }
  });
}

function updateStudyPlan(): void {
  setupStudyPlanNav();

  const container = document.getElementById("studyPlanContainer");
  if (!container) return;
  container.style.display = "";

  const contentEl = document.getElementById("studyPlanContent");
  const titleEl = document.getElementById("studyPlanTitle");
  const prevBtn = document.getElementById("studyPlanPrev") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("studyPlanNext") as HTMLButtonElement | null;

  // Show conversion error if present
  if (dashboardData?.studyPlanError) {
    if (titleEl) titleEl.textContent = "주학습계획안";
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="study-plan-error">
          <div class="study-plan-error__icon">⚠️</div>
          <div class="study-plan-error__msg">${escapeHtml(dashboardData.studyPlanError)}</div>
        </div>`;
    }
    if (prevBtn) prevBtn.style.visibility = "hidden";
    if (nextBtn) nextBtn.style.visibility = "hidden";
    return;
  }

  // Always make buttons visible if we have data
  if (prevBtn) prevBtn.style.visibility = "visible";
  if (nextBtn) nextBtn.style.visibility = "visible";

  // Handle local PDF rendering
  if (dashboardData?.studyPlanSVGs && dashboardData.studyPlanSVGs.length > 0) {
    if (studyPlanInitialLoad || studyPlanIndex < 0 || studyPlanIndex >= dashboardData.studyPlanSVGs.length) {
      if (dashboardData.studyPlanCurrentIndex !== undefined && dashboardData.studyPlanCurrentIndex >= 0) {
        studyPlanIndex = dashboardData.studyPlanCurrentIndex;
      } else {
        studyPlanIndex = dashboardData.studyPlanSVGs.length - 1;
      }
      studyPlanInitialLoad = false;
    }
    renderStudyPlanBlock();
    return;
  }

  const result = dashboardData?.studyPlan ?? null;
  if (!result || result.blocks.length === 0) {
    if (contentEl) contentEl.innerHTML = '<div class="loading-placeholder">주학습계획안이 없습니다</div>';
    if (titleEl) titleEl.textContent = "주학습계획안";
    updateStudyPlanNavButtons();
    return;
  }

  // Set to current week index for spreadsheet
  if (studyPlanInitialLoad || studyPlanIndex < 0 || studyPlanIndex >= result.blocks.length) {
      studyPlanIndex = result.currentIndex >= 0 ? result.currentIndex : 0;
      studyPlanInitialLoad = false;
  }
  renderStudyPlanBlock();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderStudyPlanBlock(): void {
  const contentEl = document.getElementById("studyPlanContent");
  const titleEl = document.getElementById("studyPlanTitle");
  if (!contentEl) return;

  // Render SVG PDF
  if (dashboardData?.studyPlanSVGs && dashboardData.studyPlanSVGs.length > 0) {
    if (studyPlanIndex < 0) studyPlanIndex = 0;
    if (studyPlanIndex >= dashboardData.studyPlanSVGs.length) studyPlanIndex = dashboardData.studyPlanSVGs.length - 1;

    const total = dashboardData.studyPlanSVGs.length;
    let titleHtml = `주학습계획안 (${studyPlanIndex + 1}/${total})`;
    if (dashboardData.studyPlanIsConverting) {
      titleHtml += ` <span style="font-size:0.8em; color:var(--text-muted);"><span class="study-plan-loading__spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></span>변환 중</span>`;
    }
    if (titleEl) titleEl.innerHTML = titleHtml;
    
    const pdfBase64 = dashboardData.studyPlanSVGs[studyPlanIndex];
    contentEl.innerHTML = `<iframe src="data:application/pdf;base64,${pdfBase64}#view=FitH" width="100%" height="100%" style="border: none; border-radius: var(--radius); background: white; display: block;"></iframe>`;
    updateStudyPlanNavButtons();
    return;
  }

  // Render Spreadsheet
  const result = dashboardData?.studyPlan;
  if (!result || studyPlanIndex < 0 || studyPlanIndex >= result.blocks.length) return;

  const block = result.blocks[studyPlanIndex];
  const isCurrent = studyPlanIndex === result.currentIndex;

  if (titleEl) titleEl.textContent = block.title || "주학습계획안";

  // Highlight today's column only if viewing the current week
  const now = new Date();
  const jsDay = now.getDay();
  const dayMap: Record<string, number> = {
    "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6,
    "일요일": 0, "월요일": 1, "화요일": 2, "수요일": 3, "목요일": 4, "금요일": 5, "토요일": 6,
  };
  const todayDayIdx = isCurrent ? block.headers.findIndex((h) => dayMap[h] === jsDay) : -1;

  let html = '<table class="study-plan-table"><thead><tr>';
  html += `<th class="period-col"></th>`;
  block.headers.forEach((h, i) => {
    const cls = i === todayDayIdx ? ' class="today-col"' : "";
    html += `<th${cls}>${h}</th>`;
  });
  html += "</tr></thead><tbody>";

  for (const row of block.rows) {
    html += "<tr>";
    html += `<td class="period-num">${row[0]}</td>`;
    for (let i = 1; i < block.headers.length + 1; i++) {
      const cls = i - 1 === todayDayIdx ? ' class="today-col"' : "";
      const cell = (row[i] ?? "").replace(/\n/g, "<br>");
      html += `<td${cls}>${cell}</td>`;
    }
    html += "</tr>";
  }

  html += "</tbody></table>";
  contentEl.innerHTML = html;

  updateStudyPlanNavButtons();
}

function updateStudyPlanNavButtons(): void {
  const prevBtn = document.getElementById("studyPlanPrev") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("studyPlanNext") as HTMLButtonElement | null;
  
  let total = 0;
  if (dashboardData?.studyPlanSVGs && dashboardData.studyPlanSVGs.length > 0) {
      total = dashboardData.studyPlanSVGs.length;
  } else if (dashboardData?.studyPlan) {
      total = dashboardData.studyPlan.blocks.length;
  }

  if (prevBtn) prevBtn.disabled = studyPlanIndex <= 0;
  if (nextBtn) nextBtn.disabled = studyPlanIndex >= total - 1 || total === 0;
}

// ===== Data Loading =====

async function loadDashboardData(): Promise<void> {
  // Show spinner while fetching (especially important for slow HWP→PDF conversion)
  const settings = getSettings();
  if (settings.studyPlanFolder) {
    const contentEl = document.getElementById("studyPlanContent");
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="study-plan-loading">
          <div class="study-plan-loading__spinner"></div>
          <span>파일 변환 중...</span>
        </div>`;
    }
    // Yield to the browser so the spinner actually paints before the blocking fetch
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  try {
    dashboardData = await window.go.main.App.FetchDashboardData();
    cachedCustomEvents = await window.go.main.App.GetCustomEvents() || [];
    lastFetchTime = Date.now();
    updateWeather();
    updateAirQuality();
    updateTimetable();
    updateMeals();
    updateEvents();
    updateStudyPlan();
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    const contentEl = document.getElementById("studyPlanContent");
    if (contentEl && settings.studyPlanFolder) {
      contentEl.innerHTML = '<div class="loading-placeholder">데이터를 불러오지 못했습니다</div>';
    }
  }
}

// ===== Alarm Popup =====

let alarmPopupTimeout: ReturnType<typeof setTimeout> | null = null;

function showAlarmPopup(event: AlarmEvent): void {
  const popup = document.getElementById("alarmPopup");
  const iconEl = document.getElementById("alarmPopupIcon");
  const textEl = document.getElementById("alarmPopupText");
  if (!popup || !iconEl || !textEl) return;

  if (alarmPopupTimeout) {
    clearTimeout(alarmPopupTimeout);
    alarmPopupTimeout = null;
  }

  popup.className = "alarm-popup";

  let icon: string = "";
  let text: string = "";

  switch (event.type) {
    case "start":
      icon = "\uD83D\uDD14";
      text = `${event.period}교시 수업 시작입니다`;
      popup.classList.add("alarm-start");
      break;
    case "end":
      icon = "\u2705";
      text = `${event.period}교시 수업 종료입니다`;
      popup.classList.add("alarm-end");
      break;
    case "warning":
      icon = "\u26A0\uFE0F";
      text = `${event.period}교시 수업 1분 전입니다`;
      popup.classList.add("alarm-warning");
      break;
  }

  iconEl.textContent = icon;
  textEl.textContent = text;

  popup.classList.add("visible");

  alarmPopupTimeout = setTimeout(() => {
    popup.classList.add("fade-out");
    popup.classList.remove("visible");
    setTimeout(() => {
      popup.className = "alarm-popup";
    }, 400);
  }, 5000);
}

function showCustomEventAlarmPopup(event: CustomAlarmEvent): void {
  const popup = document.getElementById("alarmPopup");
  const iconEl = document.getElementById("alarmPopupIcon");
  const textEl = document.getElementById("alarmPopupText");
  if (!popup || !iconEl || !textEl) return;

  if (alarmPopupTimeout) {
    clearTimeout(alarmPopupTimeout);
    alarmPopupTimeout = null;
  }

  popup.className = "alarm-popup alarm-warning";

  iconEl.textContent = "\uD83D\uDD14";
  textEl.innerHTML = `<strong>${event.name}</strong><br><span style="font-size:0.9em">${event.time}</span>`;

  popup.classList.add("visible");

  alarmPopupTimeout = setTimeout(() => {
    popup.classList.add("fade-out");
    popup.classList.remove("visible");
    setTimeout(() => {
      popup.className = "alarm-popup";
    }, 400);
  }, 10000); // 10 seconds for custom events
}

// ===== Update Loop =====

function startUpdateLoop(): void {
  setInterval(() => {
    updateClock();
    updateTimetable();

    const settings = getSettings();
    const periods = getPeriods(dashboardData?.timetable ?? null);
    const alarmEvent = checkAndPlayAlarms(periods, settings.alarmEnabled, settings.alarmSound, settings.customAlarmData);
    if (alarmEvent) {
      showAlarmPopup(alarmEvent);
    }
    
    // Add custom event alarm checking
    if (cachedCustomEvents.length > 0) {
      const ceAlarm = checkAndPlayCustomEventAlarms(cachedCustomEvents, settings.eventAlarmEnabled, settings.eventAlarmSound);
      if (ceAlarm) {
        showCustomEventAlarmPopup(ceAlarm);
      }
    }

    checkAndPlayHourlyChime(settings.timeAnnouncement);
    resetAlarmsIfNewDay();
  }, 1000);

  setInterval(() => {
    loadDashboardData();
  }, FETCH_INTERVAL);
}
