// ===== Schedule Module =====
// Handles timetable rendering, current/next period detection, and status board

import type { TimetableData, PeriodTime } from "../types";
import { parseTime, timeToMinutes } from "./utils";

const DEFAULT_PERIODS: PeriodTime[] = [];

export interface PeriodStatus {
  type: "before-school" | "in-class" | "break" | "lunch" | "after-school" | "prep";
  currentPeriod: number | null;
  nextPeriod: number | null;
  message: string;
  minutesLeft?: number;
}

export function getPeriods(timetable: TimetableData | null): PeriodTime[] {
  return timetable?.periods ?? DEFAULT_PERIODS;
}

export function getSubjects(timetable: TimetableData | null): string[][] {
  if (timetable?.subjects) return timetable.subjects;
  return Array.from({ length: 6 }, () => Array(5).fill(""));
}

export function getCurrentPeriodStatus(periods: PeriodTime[], now: Date): PeriodStatus {
  const currentMinutes = timeToMinutes(now.getHours(), now.getMinutes());
  const dayOfWeek = now.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { type: "after-school", currentPeriod: null, nextPeriod: null, message: "주말" };
  }

  if (periods.length === 0) {
    return { type: "before-school", currentPeriod: null, nextPeriod: null, message: "시간표 없음" };
  }

  const firstStart = parseTime(periods[0].start);
  const firstStartMin = timeToMinutes(firstStart.hours, firstStart.minutes);
  const lastEnd = parseTime(periods[periods.length - 1].end);
  const lastEndMin = timeToMinutes(lastEnd.hours, lastEnd.minutes);

  if (currentMinutes < firstStartMin - 10) {
    const diff = firstStartMin - currentMinutes;
    return {
      type: "before-school",
      currentPeriod: null,
      nextPeriod: 1,
      message: `등교 전 (1교시까지 ${diff}분)`,
      minutesLeft: diff,
    };
  }

  if (currentMinutes < firstStartMin) {
    const diff = firstStartMin - currentMinutes;
    return {
      type: "prep",
      currentPeriod: null,
      nextPeriod: 1,
      message: `준비시간 (${diff}분 전)`,
      minutesLeft: diff,
    };
  }

  if (currentMinutes >= lastEndMin) {
    return {
      type: "after-school",
      currentPeriod: null,
      nextPeriod: null,
      message: "하교 시간",
    };
  }

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const start = parseTime(p.start);
    const end = parseTime(p.end);
    const startMin = timeToMinutes(start.hours, start.minutes);
    const endMin = timeToMinutes(end.hours, end.minutes);

    if (currentMinutes >= startMin && currentMinutes < endMin) {
      const remaining = endMin - currentMinutes;
      return {
        type: "in-class",
        currentPeriod: p.period,
        nextPeriod: i + 1 < periods.length ? periods[i + 1].period : null,
        message: `${p.period}교시 수업 중 (${remaining}분 남음)`,
        minutesLeft: remaining,
      };
    }

    if (i + 1 < periods.length) {
      const nextStart = parseTime(periods[i + 1].start);
      const nextStartMin = timeToMinutes(nextStart.hours, nextStart.minutes);

      if (currentMinutes >= endMin && currentMinutes < nextStartMin) {
        const diff = nextStartMin - currentMinutes;

        if (nextStartMin - endMin >= 30) {
          return {
            type: "lunch",
            currentPeriod: null,
            nextPeriod: periods[i + 1].period,
            message: `점심시간 (${periods[i + 1].period}교시까지 ${diff}분)`,
            minutesLeft: diff,
          };
        }

        return {
          type: "break",
          currentPeriod: null,
          nextPeriod: periods[i + 1].period,
          message: `쉬는시간 (${periods[i + 1].period}교시까지 ${diff}분)`,
          minutesLeft: diff,
        };
      }
    }
  }

  return { type: "break", currentPeriod: null, nextPeriod: null, message: "쉬는시간" };
}

export function renderTimetable(
  tableBody: HTMLElement,
  subjects: string[][],
  periods: PeriodTime[],
  status: PeriodStatus,
  todayDayIndex: number
): void {
  tableBody.innerHTML = "";

  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const row = document.createElement("tr");

    if (status.currentPeriod === p.period) {
      row.classList.add("current-period");
    } else if (status.nextPeriod === p.period && status.type !== "in-class") {
      row.classList.add("next-period");
    }

    const periodCell = document.createElement("td");
    periodCell.classList.add("period-num");
    periodCell.innerHTML = `${p.period}<span class="period-time">${p.start}</span>`;
    row.appendChild(periodCell);

    for (let day = 0; day < 5; day++) {
      const cell = document.createElement("td");
      const subject = subjects[i]?.[day] ?? "";
      cell.textContent = subject || "-";
      if (!subject) cell.classList.add("empty");
      if (day === todayDayIndex) cell.classList.add("today-col");
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }

  const headers = document.querySelectorAll(".timetable thead th");
  headers.forEach((th, idx) => {
    th.classList.remove("today-col");
    if (idx === todayDayIndex + 1 && todayDayIndex >= 0) {
      th.classList.add("today-col");
    }
  });
}

export function getStatusBadgeClass(status: PeriodStatus): string {
  switch (status.type) {
    case "in-class": return "in-class";
    case "break":
    case "lunch": return "break-time";
    case "prep": return "prep-time";
    case "before-school":
    case "after-school": return "after-school";
    default: return "";
  }
}
