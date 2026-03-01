// ===== Settings Overlay Logic =====
// Uses Wails bindings instead of Electrobun RPC

import type { Settings, CustomBackground } from "../types";

// ===== Background Presets =====

const BG_BASE = "/assets/bg";
const BG_THUMB = "/assets/bg/thumbs";

interface BackgroundPreset {
  id: string;
  label: string;
  fallback: string;
}

interface ColorPreset {
  id: string;   // e.g. "color:#FF5252"
  label: string;
  color: string;
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

// Vivid / primary colors (20)
const VIVID_COLORS: ColorPreset[] = [
  { id: "color:#F44336", label: "레드", color: "#F44336" },
  { id: "color:#E91E63", label: "핑크", color: "#E91E63" },
  { id: "color:#9C27B0", label: "퍼플", color: "#9C27B0" },
  { id: "color:#673AB7", label: "딥퍼플", color: "#673AB7" },
  { id: "color:#3F51B5", label: "인디고", color: "#3F51B5" },
  { id: "color:#2196F3", label: "블루", color: "#2196F3" },
  { id: "color:#03A9F4", label: "라이트블루", color: "#03A9F4" },
  { id: "color:#00BCD4", label: "시안", color: "#00BCD4" },
  { id: "color:#009688", label: "틸", color: "#009688" },
  { id: "color:#4CAF50", label: "그린", color: "#4CAF50" },
  { id: "color:#8BC34A", label: "라이트그린", color: "#8BC34A" },
  { id: "color:#CDDC39", label: "라임", color: "#CDDC39" },
  { id: "color:#FFEB3B", label: "옐로우", color: "#FFEB3B" },
  { id: "color:#FFC107", label: "앰버", color: "#FFC107" },
  { id: "color:#FF9800", label: "오렌지", color: "#FF9800" },
  { id: "color:#FF5722", label: "딥오렌지", color: "#FF5722" },
  { id: "color:#795548", label: "브라운", color: "#795548" },
  { id: "color:#607D8B", label: "블루그레이", color: "#607D8B" },
  { id: "color:#212121", label: "블랙", color: "#212121" },
  { id: "color:#FFFFFF", label: "화이트", color: "#FFFFFF" },
];

// Pastel colors (20)
const PASTEL_COLORS: ColorPreset[] = [
  { id: "color:#FFCDD2", label: "베이비핑크", color: "#FFCDD2" },
  { id: "color:#F8BBD0", label: "라이트핑크", color: "#F8BBD0" },
  { id: "color:#E1BEE7", label: "라벤더", color: "#E1BEE7" },
  { id: "color:#D1C4E9", label: "라일락", color: "#D1C4E9" },
  { id: "color:#C5CAE9", label: "페리윙클", color: "#C5CAE9" },
  { id: "color:#BBDEFB", label: "베이비블루", color: "#BBDEFB" },
  { id: "color:#B3E5FC", label: "스카이블루", color: "#B3E5FC" },
  { id: "color:#B2EBF2", label: "아이스블루", color: "#B2EBF2" },
  { id: "color:#B2DFDB", label: "민트", color: "#B2DFDB" },
  { id: "color:#C8E6C9", label: "민트그린", color: "#C8E6C9" },
  { id: "color:#DCEDC8", label: "연두", color: "#DCEDC8" },
  { id: "color:#F0F4C3", label: "크림옐로우", color: "#F0F4C3" },
  { id: "color:#FFF9C4", label: "버터", color: "#FFF9C4" },
  { id: "color:#FFECB3", label: "샴페인", color: "#FFECB3" },
  { id: "color:#FFE0B2", label: "피치", color: "#FFE0B2" },
  { id: "color:#FFCCBC", label: "살몬", color: "#FFCCBC" },
  { id: "color:#D7CCC8", label: "로즈우드", color: "#D7CCC8" },
  { id: "color:#CFD8DC", label: "실버", color: "#CFD8DC" },
  { id: "color:#F5F5F5", label: "오프화이트", color: "#F5F5F5" },
  { id: "color:#FFEEFF", label: "블러쉬", color: "#FFEEFF" },
];

let selectedBackgroundId = "";
let pendingCustomAlarmData = "";
let pendingCustomAlarmName = "";
let customBackgrounds: CustomBackground[] = [];

// ===== DOM Helpers =====

function $(id: string): HTMLInputElement | HTMLSelectElement {
  return document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
}

// ===== Background =====

async function applyWindowBackground(bgId: string): Promise<void> {
  const frame = document.getElementById("windowFrame") as HTMLElement | null;
  if (!frame) return;
  if (!bgId) {
    frame.style.removeProperty("--bg-image");
    frame.style.removeProperty("--bg-color");
  } else if (bgId.startsWith("color:")) {
    frame.style.removeProperty("--bg-image");
    frame.style.setProperty("--bg-color", bgId.slice(6));
  } else if (bgId.startsWith("custom:")) {
    frame.style.removeProperty("--bg-color");
    const customId = bgId.slice(7);
    const dataURL = await window.go.main.App.GetCustomBackgroundURL(customId);
    if (dataURL) {
      frame.style.setProperty("--bg-image", `url('${dataURL}')`);
    } else {
      frame.style.removeProperty("--bg-image");
    }
  } else {
    frame.style.removeProperty("--bg-color");
    frame.style.setProperty("--bg-image", `url('${BG_BASE}/${bgId}')`);
  }
}

function deselectAll(wrapper: HTMLElement): void {
  wrapper.querySelectorAll(".bg-thumb").forEach((el) => el.classList.remove("selected"));
}

function renderColorGrid(container: HTMLElement, colors: ColorPreset[], wrapper: HTMLElement): void {
  for (const c of colors) {
    const thumb = document.createElement("div");
    thumb.className = `bg-thumb bg-thumb--color${c.id === selectedBackgroundId ? " selected" : ""}`;
    thumb.dataset.bgId = c.id;
    thumb.title = c.label;
    thumb.style.background = c.color;
    // Dark border for white-ish colors
    if (c.color.toUpperCase() === "#FFFFFF" || c.color.toUpperCase() === "#F5F5F5" ||
      c.color.toUpperCase() === "#FFEEFF" || c.color.toUpperCase() === "#FFF9C4" ||
      c.color.toUpperCase() === "#FFECB3" || c.color.toUpperCase() === "#F0F4C3" ||
      c.color.toUpperCase() === "#DCEDC8") {
      thumb.style.outline = "1px solid rgba(0,0,0,0.15)";
    }
    thumb.innerHTML = `<span class="bg-thumb__label">${c.label}</span>`;
    thumb.addEventListener("click", () => {
      selectedBackgroundId = c.id;
      deselectAll(wrapper);
      thumb.classList.add("selected");
      applyWindowBackground(c.id);
    });
    container.appendChild(thumb);
  }
}

function renderBackgroundPicker(): void {
  const wrapper = document.getElementById("backgroundGrid");
  if (!wrapper) return;

  wrapper.innerHTML = "";

  // ---- Image Section ----
  const imageHeader = document.createElement("div");
  imageHeader.className = "bg-section-header";
  imageHeader.textContent = "이미지";
  wrapper.appendChild(imageHeader);

  const imageGrid = document.createElement("div");
  imageGrid.className = "bg-tab-content bg-tab-content--image";

  for (const bg of BACKGROUNDS) {
    const thumb = document.createElement("div");
    thumb.className = `bg-thumb${bg.id === "" ? " bg-thumb--default" : ""}${bg.id === selectedBackgroundId ? " selected" : ""}`;
    thumb.dataset.bgId = bg.id;
    thumb.title = bg.label;
    thumb.style.background = bg.fallback;

    if (bg.id === "") {
      thumb.innerHTML = `<span>${bg.label}</span>`;
    } else {
      const img = document.createElement("img");
      img.src = `${BG_THUMB}/${bg.id}`;
      img.alt = bg.label;
      img.loading = "lazy";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
      img.onerror = () => { img.style.display = "none"; };
      thumb.appendChild(img);
    }

    thumb.addEventListener("click", () => {
      selectedBackgroundId = bg.id;
      deselectAll(wrapper);
      thumb.classList.add("selected");
      applyWindowBackground(bg.id);
    });

    imageGrid.appendChild(thumb);
  }

  // Custom backgrounds
  for (const cb of customBackgrounds) {
    const customBgId = `custom:${cb.id}`;
    const thumb = document.createElement("div");
    thumb.className = `bg-thumb bg-thumb--custom${customBgId === selectedBackgroundId ? " selected" : ""}`;
    thumb.dataset.bgId = customBgId;
    thumb.title = cb.name;

    window.go.main.App.GetCustomBackgroundURL(cb.id).then((dataURL: string) => {
      if (dataURL) {
        const img = document.createElement("img");
        img.src = dataURL;
        img.alt = cb.name;
        img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;";
        thumb.insertBefore(img, thumb.firstChild);
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "bg-thumb__delete";
    deleteBtn.innerHTML = "\u00D7";
    deleteBtn.title = "삭제";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.go.main.App.RemoveCustomBackground(cb.id);
      customBackgrounds = customBackgrounds.filter((b) => b.id !== cb.id);
      if (selectedBackgroundId === customBgId) {
        selectedBackgroundId = "";
        applyWindowBackground("");
      }
      renderBackgroundPicker();
    });
    thumb.appendChild(deleteBtn);

    thumb.addEventListener("click", () => {
      selectedBackgroundId = customBgId;
      deselectAll(wrapper);
      thumb.classList.add("selected");
      applyWindowBackground(customBgId);
    });

    imageGrid.appendChild(thumb);
  }

  // Add custom background button
  const addBtn = document.createElement("div");
  addBtn.className = "bg-thumb bg-thumb--add";
  addBtn.title = "이미지 추가";
  addBtn.innerHTML = `<span>+</span>`;
  addBtn.addEventListener("click", async () => {
    const result = await window.go.main.App.PickBackgroundFile();
    if (result) {
      const newBg: CustomBackground = {
        id: result.id,
        name: result.name,
        fileName: result.fileName,
      };
      customBackgrounds.push(newBg);
      selectedBackgroundId = `custom:${newBg.id}`;
      const values = collectFormValues();
      await window.go.main.App.SaveSettings(values);
      renderBackgroundPicker();
      applyWindowBackground(selectedBackgroundId);
    }
  });
  imageGrid.appendChild(addBtn);
  wrapper.appendChild(imageGrid);

  // ---- Vivid Section ----
  const vividHeader = document.createElement("div");
  vividHeader.className = "bg-section-header";
  vividHeader.textContent = "원색";
  wrapper.appendChild(vividHeader);

  const vividGrid = document.createElement("div");
  vividGrid.className = "bg-tab-content bg-tab-content--color";
  renderColorGrid(vividGrid, VIVID_COLORS, wrapper);
  wrapper.appendChild(vividGrid);

  // ---- Pastel Section ----
  const pastelHeader = document.createElement("div");
  pastelHeader.className = "bg-section-header";
  pastelHeader.textContent = "파스텔";
  wrapper.appendChild(pastelHeader);

  const pastelGrid = document.createElement("div");
  pastelGrid.className = "bg-tab-content bg-tab-content--color";
  renderColorGrid(pastelGrid, PASTEL_COLORS, wrapper);
  wrapper.appendChild(pastelGrid);
}

// ===== Form =====

function loadFormValues(s: Settings): void {
  $("schoolNameInput").value = s.schoolName;
  $("officeCode").value = s.officeCode;
  $("schoolCode").value = s.schoolCode;
  $("grade").value = String(s.grade);
  $("classNum").value = String(s.classNum);
  ($("latitude") as HTMLInputElement).value = String(s.latitude);
  ($("longitude") as HTMLInputElement).value = String(s.longitude);
  $("spreadsheetUrl").value = s.spreadsheetUrl;

  // API key toggle
  const useCustomKey = s.useCustomApiKey || false;
  ($("useCustomApiKey") as HTMLInputElement).checked = useCustomKey;
  $("customApiKey").value = s.customApiKey || "";
  const apiKeyGroup = document.getElementById("customApiKeyGroup");
  if (apiKeyGroup) apiKeyGroup.style.display = useCustomKey ? "" : "none";

  ($("alarmEnabled") as HTMLInputElement).checked = s.alarmEnabled;

  const radio = document.querySelector(`input[name="alarmSound"][value="${s.alarmSound || "classic"}"]`) as HTMLInputElement | null;
  if (radio) radio.checked = true;

  updateCustomAlarmDisplay(s.customAlarmName, s.customAlarmData);

  customBackgrounds = s.customBackgrounds || [];
  selectedBackgroundId = s.backgroundId || "";
  applyWindowBackground(selectedBackgroundId);
  renderBackgroundPicker();
}

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
    useCustomApiKey: ($("useCustomApiKey") as HTMLInputElement).checked,
    customApiKey: $("customApiKey").value.trim(),
    alarmEnabled: ($("alarmEnabled") as HTMLInputElement).checked,
    alarmSound: selectedRadio?.value || "classic",
    customAlarmData: pendingCustomAlarmData,
    customAlarmName: pendingCustomAlarmName,
    backgroundId: selectedBackgroundId,
    customBackgrounds: customBackgrounds,
  };
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

// ===== Search Results =====

function renderSearchResults(results: any[]): void {
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

      if (address) {
        showStatus("학교 위치를 가져오는 중...", "success");
        const coords = await window.go.main.App.GeocodeAddress(address);
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

// ===== Alarm Preview =====

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

// ===== Settings Init =====

export async function initSettings(): Promise<void> {
  const settings = await window.go.main.App.GetSettings();
  loadFormValues(settings);

  // Auto-start toggle
  const autoStartCheckbox = document.getElementById("autoStart") as HTMLInputElement;
  if (autoStartCheckbox) {
    autoStartCheckbox.checked = await window.go.main.App.GetAutoStart();
    autoStartCheckbox.addEventListener("change", () => {
      window.go.main.App.SetAutoStart(autoStartCheckbox.checked);
    });
  }

  // Close settings overlay
  document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
    document.getElementById("settingsOverlay")?.classList.remove("open");
  });

  // Help modal (spreadsheet)
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

  // API key toggle
  const useCustomApiKeyCheckbox = $("useCustomApiKey") as HTMLInputElement;
  const customApiKeyGroup = document.getElementById("customApiKeyGroup");
  useCustomApiKeyCheckbox.addEventListener("change", () => {
    if (customApiKeyGroup) customApiKeyGroup.style.display = useCustomApiKeyCheckbox.checked ? "" : "none";
  });

  // API key help modal
  const apiKeyHelpOverlay = document.getElementById("apiKeyHelpOverlay")!;
  document.getElementById("btnApiKeyHelp")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    apiKeyHelpOverlay.classList.add("open");
  });
  document.getElementById("btnCloseApiKeyHelp")?.addEventListener("click", () => {
    apiKeyHelpOverlay.classList.remove("open");
  });
  apiKeyHelpOverlay.addEventListener("click", (e) => {
    if (e.target === apiKeyHelpOverlay) apiKeyHelpOverlay.classList.remove("open");
  });

  // Search school (uses Go backend)
  document.getElementById("searchSchoolBtn")!.addEventListener("click", async () => {
    const schoolName = $("schoolNameInput").value.trim();
    if (!schoolName) {
      showStatus("학교 이름을 입력하세요", "error");
      return;
    }

    const btn = document.getElementById("searchSchoolBtn") as HTMLButtonElement;
    btn.textContent = "검색 중...";
    btn.disabled = true;

    try {
      const result = await window.go.main.App.SearchSchool(schoolName);
      if (result.error) {
        showStatus(result.error, "error");
        const container = document.getElementById("searchResults")!;
        container.style.display = "none";
      } else {
        renderSearchResults(result.schools);
      }
    } catch (e) {
      showStatus("학교 검색 중 오류가 발생했습니다", "error");
    } finally {
      btn.textContent = "검색";
      btn.disabled = false;
    }
  });

  // Alarm preview buttons
  document.querySelectorAll(".btn-preview[data-preset]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const preset = (btn as HTMLElement).dataset.preset!;
      playPreview(preset);
    });
  });

  // Custom alarm file picker (uses Go backend)
  document.getElementById("btnPickAlarmFile")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const result = await window.go.main.App.PickAlarmFile();
    if (result) {
      updateCustomAlarmDisplay(result.name, result.data);
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

  // Show current version
  const versionLabel = document.getElementById("currentVersionLabel");
  if (versionLabel) {
    const ver = await window.go.main.App.GetAppVersion();
    versionLabel.textContent = `v${ver}`;
  }

  // Manual update check
  let latestDownloadURL = "";
  document.getElementById("btnCheckUpdate")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnCheckUpdate") as HTMLButtonElement;
    const statusEl = document.getElementById("updateStatus")!;
    const downloadBtn = document.getElementById("btnDownloadUpdate") as HTMLButtonElement;

    btn.disabled = true;
    btn.textContent = "확인 중...";
    statusEl.className = "update-status";
    statusEl.textContent = "";
    downloadBtn.style.display = "none";

    try {
      const result = await window.go.main.App.CheckForUpdate();

      if (result.error) {
        statusEl.textContent = `업데이트 확인 실패: ${result.error}`;
        statusEl.className = "update-status error";
      } else if (result.updateAvailable) {
        statusEl.textContent = `v${result.latestVersion} 업데이트가 있습니다`;
        statusEl.className = "update-status available";
        latestDownloadURL = result.downloadURL;
        downloadBtn.style.display = "inline-flex";
      } else {
        statusEl.textContent = "최신 버전입니다";
        statusEl.className = "update-status latest";
      }
    } catch {
      statusEl.textContent = "업데이트 확인 중 오류가 발생했습니다";
      statusEl.className = "update-status error";
    }

    btn.disabled = false;
    btn.textContent = "업데이트 확인";
  });

  document.getElementById("btnDownloadUpdate")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnDownloadUpdate") as HTMLButtonElement;
    const statusEl = document.getElementById("updateStatus")!;

    btn.disabled = true;
    btn.textContent = "다운로드 중...";
    statusEl.textContent = "설치 파일을 다운로드하는 중입니다. 잠시 기다려 주세요...";
    statusEl.className = "update-status";

    const errMsg = await window.go.main.App.DownloadAndRunUpdate(latestDownloadURL);

    if (errMsg) {
      statusEl.textContent = `다운로드 실패: ${errMsg}`;
      statusEl.className = "update-status error";
      btn.disabled = false;
      btn.textContent = "다운로드";
    } else {
      statusEl.textContent = "설치 프로그램이 실행됩니다. 설치 후 앱을 다시 시작하세요.";
      statusEl.className = "update-status latest";
      // Keep button disabled — installer should take over
    }
  });

  // Save (uses Go backend)
  document.getElementById("saveBtn")!.addEventListener("click", async () => {
    const values = collectFormValues();
    await window.go.main.App.SaveSettings(values);
    showStatus("설정이 저장되었습니다", "success");
  });

  // Reset
  document.getElementById("resetBtn")!.addEventListener("click", async () => {
    if (confirm("모든 설정을 초기값으로 되돌리시겠습니까?")) {
      const defaultSettings: Settings = {
        schoolName: "",
        schoolCode: "",
        officeCode: "",
        grade: 0,
        classNum: 0,
        latitude: 0,
        longitude: 0,
        spreadsheetUrl: "",
        useCustomApiKey: false,
        customApiKey: "",
        alarmEnabled: true,
        alarmSound: "classic",
        customAlarmData: "",
        customAlarmName: "",
        backgroundId: "",
        customBackgrounds: [],
      };
      await window.go.main.App.SaveSettings(defaultSettings);
      const reloaded = await window.go.main.App.GetSettings();
      loadFormValues(reloaded);
      showStatus("설정이 초기화되었습니다", "success");
    }
  });
}

// ===== Toggle =====

export function openSettings(): void {
  document.getElementById("settingsOverlay")?.classList.add("open");
}

export function closeSettings(): void {
  document.getElementById("settingsOverlay")?.classList.remove("open");
}
