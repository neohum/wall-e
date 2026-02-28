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
      getAutoStart: { params: undefined; response: boolean };
      setAutoStart: { params: { enabled: boolean }; response: void };
      searchSchool: { params: { schoolName: string }; response: SchoolInfo[] };
      geocodeAddress: { params: { address: string }; response: { lat: number; lon: number } | null };
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

const BG_BASE = "views://bg";

interface BackgroundPreset {
  id: string;       // unique key stored in settings (= filename)
  label: string;
  fallback: string; // CSS gradient shown while/if image fails
}

const BACKGROUNDS: BackgroundPreset[] = [
  { id: "", label: "기본", fallback: "linear-gradient(135deg,#e8ecf4,#dde4f0)" },
  { id: "a-tranquil-sailboat-gliding-across-the-calm-azure-2026-02-28-11-49-53-utc.jpg", label: "요트", fallback: "linear-gradient(135deg,#74b9ff,#0984e3)" },
  { id: "aerial-view-of-a-serene-river-flowing-through-a-de-2026-02-28-11-49-53-utc.jpg", label: "강 항공뷰", fallback: "linear-gradient(135deg,#56ab2f,#2c3e50)" },
  { id: "beautiful-morning-view-in-indonesia-panoramic-lan-2026-02-28-10-33-51-utc.jpg", label: "인도네시아 아침", fallback: "linear-gradient(135deg,#f9ca24,#f0932b)" },
  { id: "blooming-cherry-blossom-tree-in-spring-with-delic-2026-02-28-12-45-10-utc.jpg", label: "벚꽃", fallback: "linear-gradient(135deg,#fbc2eb,#a18cd1)" },
  { id: "bog-landscape-with-trees-in-swamp-and-mist-retro-2026-01-09-13-53-47-utc.jpg", label: "안개 숲", fallback: "linear-gradient(135deg,#bdc3c7,#636e72)" },
  { id: "broken-brick-wall-urban-building-construction-2026-01-09-13-10-03-utc.jpg", label: "벽돌 벽", fallback: "linear-gradient(135deg,#b2773a,#6b3a2a)" },
  { id: "cordillera-2026-01-07-00-20-41-utc.jpg", label: "산맥", fallback: "linear-gradient(135deg,#667eea,#2c3e50)" },
  { id: "dark-thunderstorm-clouds-rainny-atmosphere-meteor-2026-02-01-06-07-56-utc.jpg", label: "폭풍 구름", fallback: "linear-gradient(135deg,#2d3436,#636e72)" },
  { id: "golden-sunshine-sky-tropical-tree-fields-in-sunny-2026-01-25-03-30-41-utc.jpg", label: "황금빛 들판", fallback: "linear-gradient(135deg,#f9ca24,#56ab2f)" },
  { id: "piano-keyboard-closeup-digital-image-2026-01-08-00-29-44-utc.jpg", label: "피아노", fallback: "linear-gradient(135deg,#2d3436,#b2bec3)" },
  { id: "sand-beach-aerial-top-view-of-a-beautiful-sandy-b-2026-01-09-13-04-43-utc.jpg", label: "모래 해변", fallback: "linear-gradient(135deg,#f9ca24,#74b9ff)" },
  { id: "wadi-rum-desert-jordan-stars-shine-over-desert-l-2026-01-20-23-17-14-utc.jpg", label: "사막의 별", fallback: "linear-gradient(135deg,#1a1a2e,#f9ca24)" },
];

let selectedBackgroundId = "";

function applyWindowBackground(bgId: string): void {
  const frame = document.querySelector(".window-frame") as HTMLElement | null;
  if (!frame) return;
  if (!bgId) {
    frame.style.removeProperty("--bg-image");
  } else {
    frame.style.setProperty("--bg-image", `url('${BG_BASE}/${bgId}')`);
  }
}

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

    // Always show fallback gradient first
    thumb.style.background = bg.fallback;

    if (bg.id === "") {
      thumb.innerHTML = `<span>${bg.label}</span>`;
    } else {
      const img = document.createElement("img");
      img.src = `${BG_BASE}/${bg.id}`;
      img.alt = bg.label;
      img.loading = "lazy";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
      img.onerror = () => { img.style.display = "none"; };
      thumb.appendChild(img);
    }

    thumb.addEventListener("click", () => {
      selectedBackgroundId = bg.id;
      grid.querySelectorAll(".bg-thumb").forEach((el) => el.classList.remove("selected"));
      thumb.classList.add("selected");
      applyWindowBackground(bg.id);
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
  applyWindowBackground(selectedBackgroundId);
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

// ===== School Search & Geocoding (via bun RPC) =====

async function searchSchool(schoolName: string): Promise<SchoolInfo[]> {
  if (!schoolName) return [];
  try {
    return await rpc.request.searchSchool({ schoolName });
  } catch (err) {
    console.error("searchSchool RPC error:", err);
    return [];
  }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    return await rpc.request.geocodeAddress({ address });
  } catch (err) {
    console.error("geocodeAddress RPC error:", err);
    return null;
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

  // Load auto-start state
  const autoStartCheckbox = document.getElementById("autoStart") as HTMLInputElement;
  if (autoStartCheckbox) {
    autoStartCheckbox.checked = await rpc.request.getAutoStart();
    autoStartCheckbox.addEventListener("change", () => {
      rpc.request.setAutoStart({ enabled: autoStartCheckbox.checked });
    });
  }

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
    const schoolName = $("schoolNameInput").value.trim();

    if (!schoolName) {
      showStatus("학교 이름을 입력하세요", "error");
      return;
    }

    const btn = document.getElementById("searchSchoolBtn") as HTMLButtonElement;
    btn.textContent = "검색 중...";
    btn.disabled = true;

    const results = await searchSchool(schoolName);
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
      audio.play().catch(() => { });
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
