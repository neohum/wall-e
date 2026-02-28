/**
 * Wall-E Google Apps Script - Timetable & Events API
 *
 * === Setup ===
 * 1. Google Sheets에 2개 시트를 만드세요:
 *    - "시간표" 시트: 시간표 데이터
 *    - "행사" 시트: 학교 행사 데이터
 *
 * 2. "시간표" 시트 형식 (A1부터):
 *    | 학년 | 반 | 교시 | 시작 | 종료 | 월 | 화 | 수 | 목 | 금 |
 *    |  4   | 1  |  1   | 09:00| 09:40| 국어| 수학| 영어| 과학| 국어|
 *    |  4   | 1  |  2   | 09:50| 10:30| 수학| 국어| 수학| 사회| 영어|
 *    ...
 *
 *    - 1행은 헤더 (무시됨)
 *    - A열: 학년 (숫자)
 *    - B열: 반 (숫자)
 *    - C열: 교시 (숫자)
 *    - D열: 시작시간 (HH:MM)
 *    - E열: 종료시간 (HH:MM)
 *    - F~J열: 월~금 과목명
 *
 * 3. "행사" 시트 형식 (A1부터):
 *    | 날짜       | 행사명         | 상세내용 (선택) |
 *    | 2026-03-02 | 개학식         | 1학기 시업식    |
 *    | 2026-03-15 | 학부모 상담주간 |                |
 *    ...
 *
 *    - 1행은 헤더 (무시됨)
 *    - A열: 날짜 (YYYY-MM-DD 또는 날짜 형식)
 *    - B열: 행사명
 *    - C열: 상세내용 (선택사항, 비어있어도 됨)
 *
 * 4. 배포: 확장 프로그램 > Apps Script > 배포 > 새 배포
 *    - 유형: 웹 앱
 *    - 액세스: 모든 사용자
 *    - URL을 Wall-E 설정의 GAS URL에 입력
 *
 * === API Endpoints ===
 * GET ?grade=4&class=1    → 시간표 JSON
 * GET ?type=events        → 학교 행사 JSON
 */

var SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  var params = e.parameter;

  try {
    if (params.type === "events") {
      return sendJson(getEvents());
    }

    var grade = parseInt(params.grade, 10);
    var classNum = parseInt(params["class"], 10);

    if (grade && classNum) {
      return sendJson(getTimetable(grade, classNum));
    }

    return sendJson({ error: "Missing parameters. Use ?grade=N&class=N or ?type=events" });
  } catch (err) {
    return sendJson({ error: err.message });
  }
}

/**
 * 시간표 데이터를 가져옵니다.
 */
function getTimetable(grade, classNum) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("시간표");
  if (!sheet) return { periods: [], subjects: [] };

  var data = sheet.getDataRange().getValues();
  var periods = [];
  var subjects = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowGrade = parseInt(row[0], 10);
    var rowClass = parseInt(row[1], 10);

    if (rowGrade !== grade || rowClass !== classNum) continue;

    var period = parseInt(row[2], 10);
    var start = formatTime(row[3]);
    var end = formatTime(row[4]);

    periods.push({ period: period, start: start, end: end });

    // subjects[period-1][dayOfWeek]: 0=Mon(F), 1=Tue(G), ..., 4=Fri(J)
    var daySubjects = [];
    for (var d = 0; d < 5; d++) {
      daySubjects.push(row[5 + d] ? String(row[5 + d]).trim() : "");
    }
    subjects.push(daySubjects);
  }

  return { periods: periods, subjects: subjects };
}

/**
 * 학교 행사 데이터를 가져옵니다.
 * 오늘 이후 ~ 2개월 뒤까지의 행사를 반환합니다.
 */
function getEvents() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("행사");
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var events = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() + 2);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || !row[1]) continue;

    var dateVal = parseDate(row[0]);
    if (!dateVal) continue;

    // 오늘부터 2개월 뒤까지만
    if (dateVal < today || dateVal > cutoff) continue;

    var dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyyMMdd");

    var event = {
      date: dateStr,
      name: String(row[1]).trim()
    };

    if (row[2] && String(row[2]).trim()) {
      event.detail = String(row[2]).trim();
    }

    events.push(event);
  }

  // 날짜순 정렬
  events.sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });

  return events;
}

/**
 * 시간 값을 HH:MM 문자열로 변환합니다.
 */
function formatTime(val) {
  if (val instanceof Date) {
    var h = String(val.getHours()).padStart(2, "0");
    var m = String(val.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }
  var str = String(val).trim();
  // "9:00" -> "09:00"
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    var parts = str.split(":");
    return parts[0].padStart(2, "0") + ":" + parts[1];
  }
  return str;
}

/**
 * 날짜 값을 Date로 파싱합니다.
 * 지원: Date 객체, "YYYY-MM-DD", "YYYYMMDD"
 */
function parseDate(val) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  var str = String(val).trim();
  // YYYY-MM-DD
  var match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }
  // YYYYMMDD
  match = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }
  return null;
}

/**
 * JSON 응답을 생성합니다.
 */
function sendJson(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * padStart polyfill (Apps Script 환경용)
 */
if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(typeof padString !== "undefined" ? padString : " ");
    if (this.length >= targetLength) return String(this);
    targetLength = targetLength - this.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return padString.slice(0, targetLength) + String(this);
  };
}
