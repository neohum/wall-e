// ===== Dashboard Logic =====
// Uses Wails bindings instead of Electrobun RPC

import type { Settings, DashboardData, MealData, ScheduleEvent } from "../types";
import {
  getPeriods,
  getSubjects,
  getCurrentPeriodStatus,
  renderTimetable,
  getStatusBadgeClass,
} from "./schedule";
import {
  checkAndPlayAlarms,
  resetAlarmsIfNewDay,
} from "./audio";
import {
  formatDate,
  formatTime,
  formatDateCompact,
  isToday,
  getTodayStr,
  $,
} from "./utils";

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
    spreadsheetUrl: "",
    alarmEnabled: true,
    alarmSound: "classic",
    customAlarmData: "",
    customAlarmName: "",
    backgroundId: "",
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
          SearchSchool(name: string): Promise<any[]>;
          GeocodeAddress(addr: string): Promise<any>;
          PickAlarmFile(): Promise<any>;
          GetAutoStart(): Promise<boolean>;
          SetAutoStart(enabled: boolean): Promise<void>;
          MinimizeWindow(): Promise<void>;
          MaximizeWindow(): Promise<void>;
          CloseWindow(): Promise<void>;
          GetNeisAPIKey(): Promise<string>;
        };
      };
    };
    runtime: {
      EventsOn(event: string, callback: (...args: any[]) => void): void;
      EventsOff(event: string): void;
    };
  }
}

// ===== Initialization =====

export async function initDashboard(): Promise<void> {
  cachedSettings = await window.go.main.App.GetSettings();

  setupWindowControls();
  updateHeader();
  applyBackground(cachedSettings);
  updateClock();
  await loadDashboardData();
  startUpdateLoop();

  // Listen for settings changes from Go backend
  window.runtime.EventsOn("settingsChanged", async () => {
    cachedSettings = await window.go.main.App.GetSettings();
    updateHeader();
    applyBackground(cachedSettings);
    loadDashboardData();
  });
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

// ===== Background =====

function applyBackground(settings: Settings): void {
  const frame = document.querySelector(".window-frame") as HTMLElement;
  if (!frame) return;

  if (!settings.backgroundId) {
    frame.style.removeProperty("--bg-image");
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

  const jsDay = now.getDay();
  const todayIdx = jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : -1;

  renderTimetable(tableBody, subjects, periods, status, todayIdx);

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
    dashboardData = await window.go.main.App.FetchDashboardData();
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

// ===== Update Loop =====

function startUpdateLoop(): void {
  setInterval(() => {
    updateClock();
    updateTimetable();

    const settings = getSettings();
    const periods = getPeriods(dashboardData?.timetable ?? null);
    checkAndPlayAlarms(periods, settings.alarmEnabled, settings.alarmSound, settings.customAlarmData);
    resetAlarmsIfNewDay();
  }, 1000);

  setInterval(() => {
    loadDashboardData();
  }, FETCH_INTERVAL);
}
