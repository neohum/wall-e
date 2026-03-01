// ===== Audio Module =====
// Web Audio API-based alarm sounds for class notifications
// Supports 5 presets (classic, chime, soft, digital, melody) + custom audio file

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// ===== Tone Helpers =====

function playTone(
  frequency: number,
  startTime: number,
  duration: number,
  volume: number = 0.3,
  type: OscillatorType = "sine",
): void {
  const ctx = getAudioContext();
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

function playBellTone(frequency: number, startTime: number, duration: number, volume: number = 0.3): void {
  const ctx = getAudioContext();
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

function playSoftTone(frequency: number, startTime: number, duration: number, volume: number = 0.15): void {
  const ctx = getAudioContext();
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

const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51,
} as const;

type AlarmType = "warning" | "start" | "end";

function classicWarning(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.E5, t, 0.2, 0.25);
  playTone(NOTE.C5, t + 0.25, 0.2, 0.25);
  playTone(NOTE.E5, t + 0.5, 0.2, 0.25);
  playTone(NOTE.C5, t + 0.75, 0.2, 0.25);
}

function classicStart(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.C5, t, 0.3, 0.3);
  playTone(NOTE.D5, t + 0.35, 0.3, 0.3);
  playTone(NOTE.E5, t + 0.7, 0.5, 0.35);
}

function classicEnd(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.B5, t, 0.3, 0.3);
  playTone(NOTE.E5, t + 0.35, 0.3, 0.3);
  playTone(NOTE.C5, t + 0.7, 0.5, 0.35);
}

function chimeWarning(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playBellTone(NOTE.E6, t, 0.6, 0.25);
  playBellTone(NOTE.C6, t + 0.4, 0.6, 0.25);
}

function chimeStart(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playBellTone(NOTE.C6, t, 0.8, 0.3);
  playBellTone(NOTE.E6, t + 0.3, 0.8, 0.3);
  playBellTone(NOTE.G5, t + 0.6, 1.0, 0.35);
}

function chimeEnd(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playBellTone(NOTE.G5, t, 0.8, 0.3);
  playBellTone(NOTE.E5, t + 0.3, 0.8, 0.3);
  playBellTone(NOTE.C5, t + 0.6, 1.2, 0.35);
}

function softWarning(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playSoftTone(NOTE.G4, t, 0.6, 0.12);
  playSoftTone(NOTE.E4, t + 0.7, 0.6, 0.12);
}

function softStart(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playSoftTone(NOTE.C4, t, 0.5, 0.15);
  playSoftTone(NOTE.E4, t + 0.55, 0.5, 0.15);
  playSoftTone(NOTE.G4, t + 1.1, 0.7, 0.18);
}

function softEnd(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playSoftTone(NOTE.G4, t, 0.5, 0.15);
  playSoftTone(NOTE.E4, t + 0.55, 0.5, 0.15);
  playSoftTone(NOTE.C4, t + 1.1, 0.7, 0.18);
}

function digitalWarning(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.A5, t, 0.1, 0.2, "square");
  playTone(NOTE.A5, t + 0.2, 0.1, 0.2, "square");
  playTone(NOTE.E5, t + 0.4, 0.1, 0.2, "square");
  playTone(NOTE.E5, t + 0.6, 0.1, 0.2, "square");
}

function digitalStart(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.C5, t, 0.12, 0.22, "square");
  playTone(NOTE.E5, t + 0.15, 0.12, 0.22, "square");
  playTone(NOTE.G5, t + 0.3, 0.12, 0.22, "square");
  playTone(NOTE.C6, t + 0.45, 0.25, 0.25, "square");
}

function digitalEnd(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.C6, t, 0.12, 0.22, "square");
  playTone(NOTE.G5, t + 0.15, 0.12, 0.22, "square");
  playTone(NOTE.E5, t + 0.3, 0.12, 0.22, "square");
  playTone(NOTE.C5, t + 0.45, 0.25, 0.25, "square");
}

function melodyWarning(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.E5, t, 0.15, 0.2);
  playTone(NOTE.D5, t + 0.18, 0.15, 0.2);
  playTone(NOTE.E5, t + 0.36, 0.15, 0.2);
  playTone(NOTE.G5, t + 0.54, 0.3, 0.25);
}

function melodyStart(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.C5, t, 0.2, 0.25);
  playTone(NOTE.E5, t + 0.22, 0.2, 0.25);
  playTone(NOTE.G5, t + 0.44, 0.2, 0.25);
  playTone(NOTE.A5, t + 0.66, 0.15, 0.25);
  playTone(NOTE.G5, t + 0.83, 0.4, 0.3);
}

function melodyEnd(): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playTone(NOTE.G5, t, 0.2, 0.25);
  playTone(NOTE.E5, t + 0.22, 0.2, 0.25);
  playTone(NOTE.D5, t + 0.44, 0.2, 0.25);
  playTone(NOTE.C5, t + 0.66, 0.15, 0.25);
  playTone(NOTE.C5, t + 0.88, 0.5, 0.3);
}

const PRESETS: Record<string, Record<AlarmType, () => void>> = {
  classic: { warning: classicWarning, start: classicStart, end: classicEnd },
  chime: { warning: chimeWarning, start: chimeStart, end: chimeEnd },
  soft: { warning: softWarning, start: softStart, end: softEnd },
  digital: { warning: digitalWarning, start: digitalStart, end: digitalEnd },
  melody: { warning: melodyWarning, start: melodyStart, end: melodyEnd },
};

export function playPresetAlarm(preset: string, type: AlarmType): void {
  const p = PRESETS[preset] ?? PRESETS.classic;
  p[type]();
}

export function playCustomAlarm(dataUrl: string): void {
  if (!dataUrl) return;
  const audio = new Audio(dataUrl);
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

const playedAlarms = new Set<string>();

export interface AlarmEvent {
  period: number;
  type: AlarmType;
}

export function getAlarmKey(period: number, type: "warning" | "start" | "end"): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return `${dateStr}-${period}-${type}`;
}

export function shouldPlayAlarm(key: string): boolean {
  if (playedAlarms.has(key)) return false;
  playedAlarms.add(key);
  return true;
}

export function checkAndPlayAlarms(
  periods: Array<{ period: number; start: string; end: string }>,
  enabled: boolean,
  alarmSound: string = "classic",
  customAlarmData: string = "",
): AlarmEvent | null {
  if (!enabled) return null;

  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const currentMinutes = h * 60 + m;

  if (s > 2) return null;

  for (const p of periods) {
    const [startH, startM] = p.start.split(":").map(Number);
    const [endH, endM] = p.end.split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (currentMinutes === startMin - 1) {
      const key = getAlarmKey(p.period, "warning");
      if (shouldPlayAlarm(key)) {
        if (alarmSound === "custom" && customAlarmData) {
          playCustomAlarm(customAlarmData);
        } else {
          playPresetAlarm(alarmSound, "warning");
        }
        return { period: p.period, type: "warning" };
      }
    }

    if (currentMinutes === startMin) {
      const key = getAlarmKey(p.period, "start");
      if (shouldPlayAlarm(key)) {
        if (alarmSound === "custom" && customAlarmData) {
          playCustomAlarm(customAlarmData);
        } else {
          playPresetAlarm(alarmSound, "start");
        }
        return { period: p.period, type: "start" };
      }
    }

    if (currentMinutes === endMin) {
      const key = getAlarmKey(p.period, "end");
      if (shouldPlayAlarm(key)) {
        if (alarmSound === "custom" && customAlarmData) {
          playCustomAlarm(customAlarmData);
        } else {
          playPresetAlarm(alarmSound, "end");
        }
        return { period: p.period, type: "end" };
      }
    }
  }

  return null;
}

export function resetAlarmsIfNewDay(): void {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    playedAlarms.clear();
  }
}
