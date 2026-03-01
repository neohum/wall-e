// ===== Dashboard Main Entry =====
// Initializes and runs the dashboard update loop

import { Electroview } from "electrobun/view";
import {
  fetchAllDashboardData,
  getWeatherIcon,
  getPMLevel,
  getPMLevelLabel,
  type DashboardData,
  type MealData,
  type ScheduleEvent,
} from "./api.ts";
import {
  getPeriods,
  getSubjects,
  getCurrentPeriodStatus,
  renderTimetable,
  getStatusBadgeClass,
} from "./schedule.ts";
import {
  checkAndPlayAlarms,
  resetAlarmsIfNewDay,
  type AlarmEvent,
} from "./audio.ts";
import {
  type Settings,
  formatDate,
  formatTime,
  formatDateCompact,
  isToday,
  getTodayStr,
  $,
} from "./utils.ts";

// ===== RPC Type (mirrors bun side) =====
type WindowRPC = {
  bun: {
    requests: {
      minimizeWindow: { params: undefined; response: void };
      maximizeWindow: { params: undefined; response: void };
      closeWindow: { params: undefined; response: void };
      openSettings: { params: undefined; response: void };
      getSettings: { params: undefined; response: Settings };
      checkForUpdate: { params: undefined; response: any };
      applyUpdate: { params: undefined; response: void };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      settingsChanged: Settings;
      updateAvailable: { version: string; downloadUrl: string };
    };
  };
};

// ===== Electroview & RPC =====
const rpc = Electroview.defineRPC<WindowRPC>({
  handlers: {
    requests: {},
    messages: {
      settingsChanged: (newSettings: Settings) => {
        cachedSettings = newSettings;
        updateHeader();
        applyBackground(newSettings);
        loadDashboardData();
      },
      updateAvailable: (data: { version: string; downloadUrl: string }) => {
        showUpdateBanner(data.version);
      },
    },
  },
});

const view = new Electroview({ rpc });

// ===== State =====
let dashboardData: DashboardData | null = null;
let cachedSettings: Settings | null = null;
let lastFetchTime = 0;
const FETCH_INTERVAL = 30 * 60 * 1000; // 30 minutes

const DEFAULT_SETTINGS: Settings = {
  schoolName: "",
  schoolCode: "",
  officeCode: "",
  grade: 0,
  classNum: 0,
  latitude: 0,
  longitude: 0,
  spreadsheetUrl: "",
  neisApiKey: "",
  alarmEnabled: true,
  alarmSound: "classic",
  customAlarmData: "",
  customAlarmName: "",
  backgroundId: "",
  appVersion: "",
};

function getSettings(): Settings {
  return cachedSettings ?? DEFAULT_SETTINGS;
}

// ===== Update Banner =====

function showUpdateBanner(version: string): void {
  const banner = document.getElementById("updateBanner");
  const text = document.getElementById("updateBannerText");
  if (!banner || !text) return;

  text.textContent = `v${version} 업데이트가 있습니다`;
  banner.style.display = "flex";

  const btnUpdate = document.getElementById("btnUpdate");
  const btnDismiss = document.getElementById("btnDismissUpdate");

  btnUpdate?.addEventListener("click", async () => {
    if (btnUpdate) {
      btnUpdate.textContent = "업데이트 중...";
      (btnUpdate as HTMLButtonElement).disabled = true;
    }
    try {
      await rpc.request.applyUpdate();
    } catch (err) {
      console.error("Update failed:", err);
      if (btnUpdate) {
        btnUpdate.textContent = "업데이트 실패";
      }
    }
  }, { once: true });

  btnDismiss?.addEventListener("click", () => {
    banner.style.display = "none";
  }, { once: true });
}

// ===== Initialization =====

async function init(): Promise<void> {
  // Load settings from bun process (JSON file)
  cachedSettings = await rpc.request.getSettings();

  setupWindowControls();
  updateHeader();
  applyBackground(cachedSettings);
  updateClock();
  await loadDashboardData();
  startUpdateLoop();
}

// ===== Window Controls =====

function setupWindowControls(): void {
  // Stop mousedown propagation on window control buttons so drag region doesn't activate
  const controls = document.querySelector(".window-controls");
  controls?.addEventListener("mousedown", (e) => e.stopPropagation());

  document.getElementById("btnMinimize")?.addEventListener("click", () => {
    rpc.request.minimizeWindow();
  });
  document.getElementById("btnMaximize")?.addEventListener("click", () => {
    rpc.request.maximizeWindow();
  });
  document.getElementById("btnClose")?.addEventListener("click", () => {
    rpc.request.closeWindow();
  });
  document.getElementById("btnSettings")?.addEventListener("click", () => {
    rpc.request.openSettings();
  });
}

// ===== Header =====

function updateHeader(): void {
  const settings = getSettings();
  const schoolNameEl = $("#schoolName");
  const classInfoEl = $("#classInfo");
  const versionEl = $("#appVersion");

  if (schoolNameEl) schoolNameEl.textContent = settings.schoolName || "학교 대시보드";
  if (classInfoEl) {
    classInfoEl.textContent = settings.schoolCode
      ? `${settings.grade}학년 ${settings.classNum}반`
      : "설정에서 학교 정보를 입력하세요";
  }
  if (versionEl && settings.appVersion) {
    versionEl.textContent = `v${settings.appVersion}`;
  }
}

// ===== Background =====

function applyBackground(settings: Settings): void {
  const frame = document.querySelector(".window-frame") as HTMLElement;
  if (!frame) return;

  if (!settings.backgroundId) {
    // Default: remove image overlay so CSS gradient shows
    frame.style.removeProperty("--bg-image");
    return;
  }

  // Use local image from views://bg/<filename>
  const url = `views://bg/${settings.backgroundId}`;
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
    pm10El.textContent = `PM10 ${Math.round(aq.pm10)}`;
    pm10El.className = `pm-badge ${level}`;
    pm10El.title = `미세먼지: ${getPMLevelLabel(level)}`;
  }

  if (pm25El) {
    const level = getPMLevel(aq.pm25, "pm25");
    pm25El.textContent = `PM2.5 ${Math.round(aq.pm25)}`;
    pm25El.className = `pm-badge ${level}`;
    pm25El.title = `초미세먼지: ${getPMLevelLabel(level)}`;
  }
}

// ===== Timetable =====

function updateTimetable(): void {
  const tableBody = document.getElementById("timetableBody");
  if (!tableBody) return;

  const periods = getPeriods(dashboardData?.timetable ?? null);
  const subjects = getSubjects(dashboardData?.timetable ?? null);
  const now = new Date();
  const status = getCurrentPeriodStatus(periods, now);

  // Today's day index (0=Mon, 4=Fri, -1 for weekend)
  const jsDay = now.getDay(); // 0=Sun
  const todayIdx = jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : -1;

  renderTimetable(tableBody, subjects, periods, status, todayIdx);

  // Update status badge
  const statusEl = $("#classStatus");
  if (statusEl) {
    statusEl.textContent = status.message;
    statusEl.className = `class-status-badge ${getStatusBadgeClass(status)}`;
  }

  // Update week info
  const weekEl = $("#timetableWeek");
  if (weekEl) {
    weekEl.textContent = formatDate(now);
  }
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
  // Separate allergen numbers from menu name
  // Pattern: "메뉴명 (1.2.5)" or "메뉴명(1.2.5)"
  return item.replace(
    /\(([0-9.]+)\)/g,
    '<span class="allergen">($1)</span>'
  );
}

// ===== Events =====

function updateEvents(): void {
  const container = document.getElementById("eventsContainer");
  if (!container) return;

  const events = dashboardData?.events ?? [];

  if (events.length === 0) {
    container.innerHTML = '<div class="loading-placeholder">예정된 행사가 없습니다</div>';
    return;
  }

  container.innerHTML = "";

  for (const event of events) {
    const item = document.createElement("div");
    const today = isToday(event.date);
    item.className = `event-item${today ? " today" : ""}`;

    const dateInfo = formatDateCompact(event.date);

    item.innerHTML = `
      <div class="event-item__date">
        <div class="event-item__month">${dateInfo.month}</div>
        <div class="event-item__day">${dateInfo.day}</div>
      </div>
      <div class="event-item__info">
        <div class="event-item__name">${event.name}</div>
        ${event.detail ? `<div class="event-item__detail">${event.detail}</div>` : ""}
      </div>
    `;

    container.appendChild(item);
  }
}

// ===== Data Loading =====

async function loadDashboardData(): Promise<void> {
  try {
    dashboardData = await fetchAllDashboardData(getSettings());
    lastFetchTime = Date.now();
    updateWeather();
    updateAirQuality();
    updateTimetable();
    updateMeals();
    updateEvents();
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
  }
}

// ===== Alarm Popup =====

let alarmPopupTimeout: ReturnType<typeof setTimeout> | null = null;

function showAlarmPopup(event: AlarmEvent): void {
  const popup = document.getElementById("alarmPopup");
  const iconEl = document.getElementById("alarmPopupIcon");
  const textEl = document.getElementById("alarmPopupText");
  if (!popup || !iconEl || !textEl) return;

  // Clear any existing timeout
  if (alarmPopupTimeout) {
    clearTimeout(alarmPopupTimeout);
    alarmPopupTimeout = null;
  }

  // Reset classes
  popup.className = "alarm-popup";

  let icon: string;
  let text: string;

  switch (event.type) {
    case "start":
      icon = "\uD83D\uDD14";  // 🔔
      text = `${event.period}교시 수업 시작입니다`;
      popup.classList.add("alarm-start");
      break;
    case "end":
      icon = "\u2705";  // ✅
      text = `${event.period}교시 수업 종료입니다`;
      popup.classList.add("alarm-end");
      break;
    case "warning":
      icon = "\u26A0\uFE0F";  // ⚠️
      text = `${event.period}교시 수업 1분 전입니다`;
      popup.classList.add("alarm-warning");
      break;
  }

  iconEl.textContent = icon;
  textEl.textContent = text;

  // Show popup
  popup.classList.add("visible");

  // Auto-hide after 5 seconds
  alarmPopupTimeout = setTimeout(() => {
    popup.classList.add("fade-out");
    popup.classList.remove("visible");
    setTimeout(() => {
      popup.className = "alarm-popup";
    }, 400);
  }, 5000);
}

// ===== Update Loop =====

function startUpdateLoop(): void {
  // Every second: update clock, timetable status, alarms
  setInterval(() => {
    updateClock();
    updateTimetable();

    const settings = getSettings();
    const periods = getPeriods(dashboardData?.timetable ?? null);
    const alarmEvent = checkAndPlayAlarms(periods, settings.alarmEnabled, settings.alarmSound, settings.customAlarmData);
    if (alarmEvent) {
      showAlarmPopup(alarmEvent);
    }
    resetAlarmsIfNewDay();
  }, 1000);

  // Every 30 minutes: refresh API data
  setInterval(() => {
    loadDashboardData();
  }, FETCH_INTERVAL);
}

// ===== Start =====
document.addEventListener("DOMContentLoaded", init);
