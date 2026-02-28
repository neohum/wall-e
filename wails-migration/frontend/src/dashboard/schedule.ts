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

export function getHeaders(timetable: TimetableData | null): string[] {
  return timetable?.headers ?? ["월", "화", "수", "목", "금"];
}

export function getSubjects(timetable: TimetableData | null): string[][] {
  if (timetable?.subjects) return timetable.subjects;
  const numCols = timetable?.headers?.length ?? 5;
  return Array.from({ length: 6 }, () => Array(numCols).fill(""));
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
  todayDayIndex: number,
  headers: string[]
): void {
  // Render thead dynamically
  const thead = document.getElementById("timetableHead");
  if (thead) {
    thead.innerHTML = "";
    const headRow = document.createElement("tr");

    const thPeriod = document.createElement("th");
    thPeriod.className = "period-col";
    thPeriod.textContent = "교시";
    headRow.appendChild(thPeriod);

    const thStart = document.createElement("th");
    thStart.className = "time-col";
    thStart.textContent = "시작";
    headRow.appendChild(thStart);

    const thEnd = document.createElement("th");
    thEnd.className = "time-col";
    thEnd.textContent = "종료";
    headRow.appendChild(thEnd);

    for (let d = 0; d < headers.length; d++) {
      const th = document.createElement("th");
      th.textContent = headers[d];
      if (d === todayDayIndex) th.classList.add("today-col");
      headRow.appendChild(th);
    }

    thead.appendChild(headRow);
  }

  // Render tbody
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
    periodCell.textContent = String(p.period);
    row.appendChild(periodCell);

    const startCell = document.createElement("td");
    startCell.classList.add("time-col");
    startCell.textContent = p.start;
    row.appendChild(startCell);

    const endCell = document.createElement("td");
    endCell.classList.add("time-col");
    endCell.textContent = p.end;
    row.appendChild(endCell);

    for (let day = 0; day < headers.length; day++) {
      const cell = document.createElement("td");
      const subject = subjects[i]?.[day] ?? "";
      cell.textContent = subject || "-";
      if (!subject) cell.classList.add("empty");
      if (day === todayDayIndex) cell.classList.add("today-col");
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }
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
