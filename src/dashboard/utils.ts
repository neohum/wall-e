// ===== Utility Functions & Settings =====

export interface Settings {
  schoolName: string;
  schoolCode: string;
  officeCode: string;
  grade: number;
  classNum: number;
  latitude: number;
  longitude: number;
  spreadsheetUrl: string;
  neisApiKey: string;
  alarmEnabled: boolean;
  alarmSound: string;
  customAlarmData: string;
  customAlarmName: string;
  backgroundId: string;
}

// Day of week helpers
const DAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function getDayNameKo(dayIndex: number): string {
  return DAY_NAMES_KO[dayIndex] ?? "";
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = getDayNameKo(date.getDay());
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

export function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function formatDateCompact(dateStr: string): { month: string; day: string; dayOfWeek: string } {
  // dateStr: YYYYMMDD
  const y = parseInt(dateStr.slice(0, 4));
  const m = parseInt(dateStr.slice(4, 6));
  const d = parseInt(dateStr.slice(6, 8));
  const date = new Date(y, m - 1, d);
  return {
    month: `${m}월`,
    day: String(d),
    dayOfWeek: getDayNameKo(date.getDay()),
  };
}

export function isToday(dateStr: string): boolean {
  const now = new Date();
  const todayStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return dateStr === todayStr;
}

export function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hours: h, minutes: m };
}

export function timeToMinutes(hours: number, minutes: number): number {
  return hours * 60 + minutes;
}

export function $ (selector: string): HTMLElement | null {
  return document.querySelector(selector);
}

export function $$ (selector: string): NodeListOf<HTMLElement> {
  return document.querySelectorAll(selector);
}
