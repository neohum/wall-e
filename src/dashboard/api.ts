// ===== API Module for Wall-E Dashboard =====
// Handles weather, air quality, meals, school info, and schedule data

import { type Settings } from "./utils.ts";

// ===== Types =====

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  dailyMax: number;
  dailyMin: number;
  precipitationProbability: number;
}

export interface AirQualityData {
  pm10: number;
  pm25: number;
}

export interface MealData {
  date: string; // YYYYMMDD
  menu: string[];
  calories?: string;
}

export interface SchoolInfo {
  schoolCode: string;
  officeCode: string; // 교육청 코드
  schoolName: string;
  address?: string;
}

export interface ScheduleEvent {
  date: string; // YYYYMMDD
  name: string;
  detail?: string;
}

export interface TimetableData {
  periods: PeriodTime[];
  subjects: string[][]; // [period][dayOfWeek(0=Mon)]
}

export interface PeriodTime {
  period: number;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

// ===== Weather API (Open-Meteo) =====

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

export function getWeatherIcon(code: number): string {
  return WEATHER_CODE_MAP[code] ?? "🌡️";
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      temperature: data.current_weather.temperature,
      weatherCode: data.current_weather.weathercode,
      dailyMax: data.daily.temperature_2m_max[0],
      dailyMin: data.daily.temperature_2m_min[0],
      precipitationProbability: data.daily.precipitation_probability_max[0] ?? 0,
    };
  } catch {
    return null;
  }
}

// ===== Air Quality API (Open-Meteo) =====

export type AirQualityLevel = "good" | "moderate" | "unhealthy" | "very-unhealthy";

export function getPMLevel(value: number, type: "pm10" | "pm25"): AirQualityLevel {
  if (type === "pm10") {
    if (value <= 30) return "good";
    if (value <= 80) return "moderate";
    if (value <= 150) return "unhealthy";
    return "very-unhealthy";
  }
  // pm2.5
  if (value <= 15) return "good";
  if (value <= 35) return "moderate";
  if (value <= 75) return "unhealthy";
  return "very-unhealthy";
}

export function getPMLevelLabel(level: AirQualityLevel): string {
  const labels: Record<AirQualityLevel, string> = {
    "good": "좋음",
    "moderate": "보통",
    "unhealthy": "나쁨",
    "very-unhealthy": "매우나쁨",
  };
  return labels[level];
}

export async function fetchAirQuality(lat: number, lon: number): Promise<AirQualityData | null> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5&timezone=Asia/Seoul`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      pm10: data.current.pm10,
      pm25: data.current.pm2_5,
    };
  } catch {
    return null;
  }
}

// ===== NEIS Meal API =====

export async function fetchMeals(
  apiKey: string,
  officeCode: string,
  schoolCode: string,
  fromDate: string,
  toDate: string
): Promise<MealData[]> {
  try {
    const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${apiKey}&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&MLSV_FROM_YMD=${fromDate}&MLSV_TO_YMD=${toDate}&Type=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const rows = data?.mealServiceDietInfo?.[1]?.row;
    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      date: row.MLSV_YMD,
      menu: row.DDISH_NM.split("<br/>").map((s: string) => s.trim()).filter(Boolean),
      calories: row.CAL_INFO,
    }));
  } catch {
    return [];
  }
}

// ===== NEIS School Info API =====

export async function searchSchool(apiKey: string, schoolName: string): Promise<SchoolInfo[]> {
  try {
    const url = `https://open.neis.go.kr/hub/schoolInfo?KEY=${apiKey}&SCHUL_NM=${encodeURIComponent(schoolName)}&Type=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const rows = data?.schoolInfo?.[1]?.row;
    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      schoolCode: row.SD_SCHUL_CODE,
      officeCode: row.ATPT_OFCDC_SC_CODE,
      schoolName: row.SCHUL_NM,
      address: row.ORG_RDNMA,
    }));
  } catch {
    return [];
  }
}

// ===== NEIS Academic Calendar API =====

export async function fetchSchoolEvents(
  apiKey: string,
  officeCode: string,
  schoolCode: string,
  fromDate: string,
  toDate: string
): Promise<ScheduleEvent[]> {
  try {
    const url = `https://open.neis.go.kr/hub/SchoolSchedule?KEY=${apiKey}&ATPT_OFCDC_SC_CODE=${officeCode}&SD_SCHUL_CODE=${schoolCode}&AA_FROM_YMD=${fromDate}&AA_TO_YMD=${toDate}&Type=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const rows = data?.SchoolSchedule?.[1]?.row;
    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      date: row.AA_YMD,
      name: row.EVENT_NM,
      detail: row.EVENT_CNTNT || undefined,
    }));
  } catch {
    return [];
  }
}

// ===== Google Spreadsheet Timetable =====

/**
 * Extract spreadsheet ID from a Google Sheets URL or bare ID.
 * Accepts formats:
 *   - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
 *   - https://docs.google.com/spreadsheets/d/SPREADSHEET_ID
 *   - bare SPREADSHEET_ID (alphanumeric + dashes + underscores)
 */
export function extractSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Try URL pattern first
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Bare ID: only alphanumeric, dashes, underscores, reasonable length
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Parse CSV text into a 2D string array.
 * Handles quoted fields containing commas and newlines.
 */
export function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(current);
        current = "";
      } else if (ch === "\r" && next === "\n") {
        row.push(current);
        current = "";
        rows.push(row);
        row = [];
        i++; // skip \n
      } else if (ch === "\n") {
        row.push(current);
        current = "";
        rows.push(row);
        row = [];
      } else {
        current += ch;
      }
    }
  }

  // Last field / row
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

/**
 * Convert parsed CSV rows into TimetableData.
 * Expected columns: 교시, 시작, 종료, 월, 화, 수, 목, 금
 * First row is header (skipped).
 */
export function csvToTimetableData(rows: string[][]): TimetableData | null {
  if (rows.length < 2) return null; // need header + at least 1 data row

  const dataRows = rows.slice(1); // skip header
  const periods: PeriodTime[] = [];
  const subjects: string[][] = [];

  for (const cols of dataRows) {
    const periodNum = parseInt(cols[0]?.trim());
    const start = cols[1]?.trim();
    const end = cols[2]?.trim();

    // Validate period number and time format
    if (isNaN(periodNum) || !start || !end) continue;
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) continue;

    // Normalize to HH:MM
    const startNorm = start.includes(":") ? start.padStart(5, "0") : start;
    const endNorm = end.includes(":") ? end.padStart(5, "0") : end;

    periods.push({ period: periodNum, start: startNorm, end: endNorm });

    // Columns D~H (index 3~7) = Mon~Fri subjects
    const daySubjects: string[] = [];
    for (let d = 0; d < 5; d++) {
      daySubjects.push(cols[3 + d]?.trim() || "");
    }
    subjects.push(daySubjects);
  }

  if (periods.length === 0) return null;
  return { periods, subjects };
}

/**
 * Fetch timetable from a Google Spreadsheet via CSV export.
 */
export async function fetchTimetableFromSheet(spreadsheetUrl: string): Promise<TimetableData | null> {
  if (!spreadsheetUrl) return null;

  const sheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!sheetId) return null;

  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const res = await fetch(csvUrl);
    if (!res.ok) return null;
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    return csvToTimetableData(rows);
  } catch {
    return null;
  }
}

// ===== Google Spreadsheet Events (행사 시트) =====

/**
 * Fetch events from the "행사" sheet tab of the same Google Spreadsheet.
 * Expected columns: 날짜 (YYYY-MM-DD or YYYY.MM.DD), 행사명, 상세내용 (optional)
 * First row is header (skipped).
 */
export async function fetchEventsFromSheet(spreadsheetUrl: string): Promise<ScheduleEvent[]> {
  if (!spreadsheetUrl) return [];

  const sheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!sheetId) return [];

  try {
    // gid is unknown, so use sheet name via gviz tq query
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("행사")}`;
    const res = await fetch(csvUrl);
    if (!res.ok) return [];
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    return csvToEvents(rows);
  } catch {
    return [];
  }
}

/**
 * Convert parsed CSV rows into ScheduleEvent[].
 * Expected columns: 날짜, 행사명, 상세내용 (optional)
 */
export function csvToEvents(rows: string[][]): ScheduleEvent[] {
  if (rows.length < 2) return [];

  const dataRows = rows.slice(1); // skip header
  const events: ScheduleEvent[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() + 2);

  for (const cols of dataRows) {
    const rawDate = cols[0]?.trim();
    const name = cols[1]?.trim();
    if (!rawDate || !name) continue;

    const dateStr = parseDateToYYYYMMDD(rawDate);
    if (!dateStr) continue;

    // Filter: today onwards up to 2 months
    const y = parseInt(dateStr.slice(0, 4));
    const m = parseInt(dateStr.slice(4, 6)) - 1;
    const d = parseInt(dateStr.slice(6, 8));
    const eventDate = new Date(y, m, d);
    if (eventDate < today || eventDate > cutoff) continue;

    const event: ScheduleEvent = { date: dateStr, name };
    const detail = cols[2]?.trim();
    if (detail) event.detail = detail;
    events.push(event);
  }

  return events;
}

/**
 * Parse various date formats to YYYYMMDD string.
 * Supports: "2026-03-02", "2026.03.02", "2026/03/02", "20260302"
 */
function parseDateToYYYYMMDD(raw: string): string | null {
  // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  let match = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match) {
    return match[1] + match[2].padStart(2, "0") + match[3].padStart(2, "0");
  }
  // YYYYMMDD
  match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return match[1] + match[2] + match[3];
  }
  return null;
}

// ===== Aggregated Fetch =====

export interface DashboardData {
  weather: WeatherData | null;
  airQuality: AirQualityData | null;
  meals: MealData[];
  events: ScheduleEvent[];
  timetable: TimetableData | null;
}

export async function fetchAllDashboardData(settings: Settings): Promise<DashboardData> {
  const today = new Date();
  const todayStr = formatDateStr(today);

  // Calculate date ranges
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(threeDaysLater.getDate() + 7);
  const toDateStr = formatDateStr(threeDaysLater);

  // End of month for events
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const eventEndStr = formatDateStr(endOfMonth);

  const [weather, airQuality, meals, neisEvents, timetable, sheetEvents] = await Promise.all([
    fetchWeather(settings.latitude, settings.longitude),
    fetchAirQuality(settings.latitude, settings.longitude),
    settings.neisApiKey && settings.schoolCode && settings.officeCode
      ? fetchMeals(settings.neisApiKey, settings.officeCode, settings.schoolCode, todayStr, toDateStr)
      : Promise.resolve([]),
    settings.neisApiKey && settings.schoolCode && settings.officeCode
      ? fetchSchoolEvents(settings.neisApiKey, settings.officeCode, settings.schoolCode, todayStr, eventEndStr)
      : Promise.resolve([]),
    fetchTimetableFromSheet(settings.spreadsheetUrl),
    fetchEventsFromSheet(settings.spreadsheetUrl),
  ]);

  // Merge NEIS + spreadsheet events, deduplicate by date+name
  const allEvents = [...neisEvents, ...sheetEvents];
  const seen = new Set<string>();
  const events = allEvents.filter((e) => {
    const key = `${e.date}-${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30);

  return { weather, airQuality, meals, events, timetable };
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
