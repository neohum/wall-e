// ===== Settings Screen Logic =====

import { Electroview } from "electrobun/view";

// ===== Types =====

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

interface SettingsWithKey extends Settings {
  neisApiKey: string;
}

interface SchoolInfo {
  schoolCode: string;
  officeCode: string;
  schoolName: string;
  address?: string;
}

// ===== RPC Type (mirrors bun side) =====
type SettingsRPC = {
  bun: {
    requests: {
      closeSettings: { params: undefined; response: void };
      getSettings: { params: undefined; response: SettingsWithKey };
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

const rpc = Electroview.defineRPC<SettingsRPC>({
  handlers: {
    requests: {},
  },
});

const view = new Electroview({ rpc });

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

// ===== Background Presets =====

interface BackgroundPreset {
  id: string;   // Unsplash photo ID, "" = default gradient
  label: string;
}

const BACKGROUNDS: BackgroundPreset[] = [
  { id: "", label: "기본" },
  { id: "SmAi_Cme6jU", label: "청녹 마블" },
  { id: "rlh8o7OaOU0", label: "블루-퍼플" },
  { id: "lMq3sfMMViM", label: "블루-옐로우" },
  { id: "RALqK3Vo_0g", label: "퍼플-화이트" },
  { id: "RMNff5xIWDs", label: "블루-화이트" },
  { id: "-ujJRILf3lU", label: "오렌지-그린-블루" },
  { id: "CcOXh34BbkI", label: "레드-옐로우-블루" },
  { id: "6dNt5M6fD9A", label: "블루-핑크-퍼플" },
  { id: "-GsmIofI7OE", label: "베이지-브라운" },
  { id: "Z1p1IVnDM2k", label: "오렌지-옐로우" },
  { id: "Ye6swDS_yyk", label: "산과 호수" },
  { id: "oQ7Y2-Gi-FI", label: "산 정상" },
  { id: "muRjV3DCYZk", label: "계곡과 구름" },
  { id: "gUMfgoMV5sM", label: "눈덮인 산" },
  { id: "hBI6dqA6uv4", label: "설산 풍경" },
  { id: "Flei7j6myc0", label: "초원과 산" },
  { id: "8UD8HlJKVPY", label: "퍼플 석양" },
  { id: "r8yzUfACOg0", label: "파스텔 구름" },
  { id: "RPdV48lsDMo", label: "핑크 구름" },
  { id: "52B664lcBQk", label: "핑크 석양 산" },
];

let selectedBackgroundId = "";

// Cached settings (loaded from bun on init)
let cachedSettings: SettingsWithKey | null = null;

// Custom alarm state (held in memory until save)
let pendingCustomAlarmData = "";
let pendingCustomAlarmName = "";

// ===== DOM Helpers =====

function $(id: string): HTMLInputElement | HTMLSelectElement {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
}

// ===== Background Picker =====

function renderBackgroundPicker(): void {
  const grid = document.getElementById("backgroundGrid");
  if (!grid) return;

  grid.innerHTML = "";

  for (const bg of BACKGROUNDS) {
    const thumb = document.createElement("div");
    thumb.className = `bg-thumb${bg.id === "" ? " bg-thumb--default" : ""}${bg.id === selectedBackgroundId ? " selected" : ""}`;
    thumb.dataset.bgId = bg.id;
    thumb.title = bg.label;

    if (bg.id === "") {
      thumb.innerHTML = `<span>${bg.label}</span>`;
    } else {
      const url = `https://images.unsplash.com/photo-${bg.id}?w=200&h=120&fit=crop&auto=format`;
      thumb.innerHTML = `<img src="${url}" alt="${bg.label}" loading="lazy">`;
    }

    thumb.addEventListener("click", () => {
      selectedBackgroundId = bg.id;
      grid.querySelectorAll(".bg-thumb").forEach((el) => el.classList.remove("selected"));
      thumb.classList.add("selected");
    });

    grid.appendChild(thumb);
  }
}

// ===== Load settings into form =====

function loadFormValues(s: SettingsWithKey): void {
  $("schoolNameInput").value = s.schoolName;
  $("officeCode").value = s.officeCode;
  $("schoolCode").value = s.schoolCode;
  $("grade").value = String(s.grade);
  $("classNum").value = String(s.classNum);
  ($("latitude") as HTMLInputElement).value = String(s.latitude);
  ($("longitude") as HTMLInputElement).value = String(s.longitude);
  $("spreadsheetUrl").value = s.spreadsheetUrl;
  ($("alarmEnabled") as HTMLInputElement).checked = s.alarmEnabled;

  // Alarm sound preset
  const radio = document.querySelector(`input[name="alarmSound"][value="${s.alarmSound || "classic"}"]`) as HTMLInputElement | null;
  if (radio) radio.checked = true;

  // Custom alarm info
  updateCustomAlarmDisplay(s.customAlarmName, s.customAlarmData);

  // Background
  selectedBackgroundId = s.backgroundId || "";
  renderBackgroundPicker();
}

// ===== Collect form values =====

function collectFormValues(): Settings {
  const selectedRadio = document.querySelector('input[name="alarmSound"]:checked') as HTMLInputElement | null;
  return {
    schoolName: $("schoolNameInput").value.trim(),
    schoolCode: $("schoolCode").value.trim(),
    officeCode: $("officeCode").value.trim(),
    grade: parseInt($("grade").value) || 0,
    classNum: parseInt($("classNum").value) || 0,
    latitude: parseFloat(($("latitude") as HTMLInputElement).value) || 0,
    longitude: parseFloat(($("longitude") as HTMLInputElement).value) || 0,
    spreadsheetUrl: $("spreadsheetUrl").value.trim(),
    alarmEnabled: ($("alarmEnabled") as HTMLInputElement).checked,
    alarmSound: selectedRadio?.value || "classic",
    customAlarmData: pendingCustomAlarmData,
    customAlarmName: pendingCustomAlarmName,
    backgroundId: selectedBackgroundId,
  };
}

// ===== Address Geocoding (Nominatim / OpenStreetMap) =====

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "ko" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ===== School Search =====

async function searchSchool(apiKey: string, schoolName: string): Promise<SchoolInfo[]> {
  if (!apiKey || !schoolName) return [];
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

function renderSearchResults(results: SchoolInfo[]): void {
  const container = document.getElementById("searchResults")!;

  if (results.length === 0) {
    container.innerHTML = '<div class="search-result-item"><span class="school-name">검색 결과가 없습니다</span></div>';
    container.style.display = "block";
    return;
  }

  container.innerHTML = results.map((r) => `
    <div class="search-result-item" data-code="${r.schoolCode}" data-office="${r.officeCode}" data-name="${r.schoolName}" data-address="${r.address || ""}">
      <div class="school-name">${r.schoolName}</div>
      <div class="school-address">${r.address || ""} (${r.officeCode} / ${r.schoolCode})</div>
    </div>
  `).join("");

  container.style.display = "block";

  // Click handlers
  container.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const el = item as HTMLElement;
      const code = el.dataset.code || "";
      const office = el.dataset.office || "";
      const name = el.dataset.name || "";
      const address = el.dataset.address || "";

      $("schoolCode").value = code;
      $("officeCode").value = office;
      $("schoolNameInput").value = name;
      container.style.display = "none";

      // Geocode school address to get lat/lon
      if (address) {
        showStatus("학교 위치를 가져오는 중...", "success");
        const coords = await geocodeAddress(address);
        if (coords) {
          ($("latitude") as HTMLInputElement).value = String(coords.lat);
          ($("longitude") as HTMLInputElement).value = String(coords.lon);
          showStatus(`${name} 위치가 설정되었습니다`, "success");
        } else {
          showStatus("주소에서 위치를 가져오지 못했습니다", "error");
        }
      }
    });
  });
}

// ===== Alarm Sound Preview =====

let previewAudioContext: AudioContext | null = null;

function getPreviewCtx(): AudioContext {
  if (!previewAudioContext) {
    previewAudioContext = new AudioContext();
  }
  return previewAudioContext;
}

function previewTone(
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.3,
  type: OscillatorType = "sine",
): void {
  const ctx = getPreviewCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.setValueAtTime(volume, startTime + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function previewBell(frequency: number, startTime: number, duration: number, volume: number = 0.3): void {
  const ctx = getPreviewCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function previewSoft(frequency: number, startTime: number, duration: number, volume: number = 0.15): void {
  const ctx = getPreviewCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + duration * 0.3);
  gain.gain.linearRampToValueAtTime(volume * 0.8, startTime + duration * 0.7);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

const N = {
  C4: 261.63, E4: 329.63, G4: 392.00,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, E6: 1318.51,
};

function playPreview(preset: string): void {
  const ctx = getPreviewCtx();
  const t = ctx.currentTime;
  switch (preset) {
    case "classic":
      previewTone(N.C5, t, 0.3, 0.3);
      previewTone(N.D5, t + 0.35, 0.3, 0.3);
      previewTone(N.E5, t + 0.7, 0.5, 0.35);
      break;
    case "chime":
      previewBell(N.C6, t, 0.8, 0.3);
      previewBell(N.E6, t + 0.3, 0.8, 0.3);
      previewBell(N.G5, t + 0.6, 1.0, 0.35);
      break;
    case "soft":
      previewSoft(N.C4, t, 0.5, 0.15);
      previewSoft(N.E4, t + 0.55, 0.5, 0.15);
      previewSoft(N.G4, t + 1.1, 0.7, 0.18);
      break;
    case "digital":
      previewTone(N.C5, t, 0.12, 0.22, "square");
      previewTone(N.E5, t + 0.15, 0.12, 0.22, "square");
      previewTone(N.G5, t + 0.3, 0.12, 0.22, "square");
      previewTone(N.C6, t + 0.45, 0.25, 0.25, "square");
      break;
    case "melody":
      previewTone(N.C5, t, 0.2, 0.25);
      previewTone(N.E5, t + 0.22, 0.2, 0.25);
      previewTone(N.G5, t + 0.44, 0.2, 0.25);
      previewTone(N.A5, t + 0.66, 0.15, 0.25);
      previewTone(N.G5, t + 0.83, 0.4, 0.3);
      break;
  }
}

function updateCustomAlarmDisplay(name: string, data: string): void {
  const infoEl = document.getElementById("customAlarmInfo");
  const nameEl = document.getElementById("customAlarmName");
  if (!infoEl || !nameEl) return;

  pendingCustomAlarmData = data || "";
  pendingCustomAlarmName = name || "";

  if (name) {
    nameEl.textContent = name;
    infoEl.style.display = "flex";
  } else {
    infoEl.style.display = "none";
  }
}

// ===== Status Message =====

function showStatus(message: string, type: "success" | "error"): void {
  const el = document.getElementById("statusMessage")!;
  el.textContent = message;
  el.className = `status-message ${type}`;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
  }, 3000);
}

// ===== Event Handlers =====

async function init(): Promise<void> {
  // Load settings from bun process (JSON file)
  cachedSettings = await rpc.request.getSettings();
  loadFormValues(cachedSettings);

  // Close settings window
  document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
    rpc.request.closeSettings();
  });

  // Help modal
  const helpOverlay = document.getElementById("helpOverlay")!;
  document.getElementById("btnHelp")?.addEventListener("click", () => {
    helpOverlay.classList.add("open");
  });
  document.getElementById("btnCloseHelp")?.addEventListener("click", () => {
    helpOverlay.classList.remove("open");
  });
  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.remove("open");
  });

  // Search school
  document.getElementById("searchSchoolBtn")!.addEventListener("click", async () => {
    const apiKey = cachedSettings?.neisApiKey || "";
    const schoolName = $("schoolNameInput").value.trim();

    if (!apiKey) {
      showStatus("NEIS API 키가 설정되지 않았습니다 (.env 파일 확인)", "error");
      return;
    }
    if (!schoolName) {
      showStatus("학교 이름을 입력하세요", "error");
      return;
    }

    const btn = document.getElementById("searchSchoolBtn") as HTMLButtonElement;
    btn.textContent = "검색 중...";
    btn.disabled = true;

    const results = await searchSchool(apiKey, schoolName);
    renderSearchResults(results);

    btn.textContent = "검색";
    btn.disabled = false;
  });

  // Alarm sound preset preview buttons
  document.querySelectorAll(".btn-preview[data-preset]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const preset = (btn as HTMLElement).dataset.preset!;
      playPreview(preset);
    });
  });

  // Custom alarm file picker
  document.getElementById("btnPickAlarmFile")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await rpc.request.pickAlarmFile();
    if (result) {
      updateCustomAlarmDisplay(result.name, result.data);
      // Auto-select the "custom" radio
      const customRadio = document.querySelector('input[name="alarmSound"][value="custom"]') as HTMLInputElement;
      if (customRadio) customRadio.checked = true;
    }
  });

  // Custom alarm preview
  document.getElementById("btnPreviewCustom")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingCustomAlarmData) {
      const audio = new Audio(pendingCustomAlarmData);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }
  });

  // Save — send to bun process which writes JSON file
  document.getElementById("saveBtn")!.addEventListener("click", async () => {
    const values = collectFormValues();
    await rpc.request.saveSettings(values);
    showStatus("설정이 저장되었습니다", "success");
  });

  // Reset
  document.getElementById("resetBtn")!.addEventListener("click", async () => {
    if (confirm("모든 설정을 초기값으로 되돌리시겠습니까?")) {
      await rpc.request.saveSettings(DEFAULT_SETTINGS);
      cachedSettings = await rpc.request.getSettings();
      loadFormValues(cachedSettings);
      showStatus("설정이 초기화되었습니다", "success");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
