// ===== Dashboard Logic =====
// Uses Wails bindings instead of Electrobun RPC

import type { Settings, DashboardData, MealData, ScheduleEvent } from "../types";
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
  resetAlarmsIfNewDay,
  type AlarmEvent,
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
    customBackgrounds: [],
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
  updateAppVersion();
  applyBackground(cachedSettings);
  updateClock();
  await loadDashboardData();
  startUpdateLoop();

  // Auto update check on startup
  checkForUpdateOnStartup();

  // Listen for settings changes from Go backend
  window.runtime.EventsOn("settingsChanged", async () => {
    cachedSettings = await window.go.main.App.GetSettings();
    updateHeader();
    applyBackground(cachedSettings);
    loadDashboardData();
  });
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

      const errMsg = await window.go.main.App.DownloadAndRunUpdate(downloadURL);
      if (errMsg) {
        statusEl.textContent = `실패: ${errMsg}`;
        btnNow.disabled = false;
        btnNow.textContent = "업데이트";
        btnLater.style.display = "";
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
  if (!frame) return;

  if (!settings.backgroundId) {
    frame.style.removeProperty("--bg-image");
    return;
  }

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

// ===== Study Plan =====

let studyPlanIndex = 0;
let studyPlanNavSetup = false;

function setupStudyPlanNav(): void {
  if (studyPlanNavSetup) return;
  studyPlanNavSetup = true;

  document.getElementById("studyPlanPrev")?.addEventListener("click", () => {
    const result = dashboardData?.studyPlan;
    if (!result || result.blocks.length === 0) return;
    if (studyPlanIndex > 0) {
      studyPlanIndex--;
      renderStudyPlanBlock();
    }
  });

  document.getElementById("studyPlanNext")?.addEventListener("click", () => {
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

  const result = dashboardData?.studyPlan ?? null;
  if (!result || result.blocks.length === 0) {
    const contentEl = document.getElementById("studyPlanContent");
    const titleEl = document.getElementById("studyPlanTitle");
    if (contentEl) contentEl.innerHTML = '<div class="loading-placeholder">주학습계획안이 없습니다</div>';
    if (titleEl) titleEl.textContent = "주학습계획안";
    updateStudyPlanNavButtons();
    return;
  }

  // Set to current week index
  studyPlanIndex = result.currentIndex >= 0 ? result.currentIndex : 0;
  renderStudyPlanBlock();
}

function renderStudyPlanBlock(): void {
  const contentEl = document.getElementById("studyPlanContent");
  const titleEl = document.getElementById("studyPlanTitle");
  if (!contentEl) return;

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
  const result = dashboardData?.studyPlan;
  const total = result?.blocks.length ?? 0;

  if (prevBtn) prevBtn.disabled = studyPlanIndex <= 0;
  if (nextBtn) nextBtn.disabled = studyPlanIndex >= total - 1;
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
    updateStudyPlan();
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

  if (alarmPopupTimeout) {
    clearTimeout(alarmPopupTimeout);
    alarmPopupTimeout = null;
  }

  popup.className = "alarm-popup";

  let icon: string;
  let text: string;

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
    resetAlarmsIfNewDay();
  }, 1000);

  setInterval(() => {
    loadDashboardData();
  }, FETCH_INTERVAL);
}
