import { $ } from "./utils";
import { playPresetAlarm, playCustomAlarm } from "./audio";

let remainingSeconds = 0;
let timerInterval: number | null = null;
let isPlaying = false;

// Variables for Dragging FAB
let isDragging = false;
let startX = 0, startY = 0;
let initialX = 0, initialY = 0;

export function initTimer(): void {
  const fab = $("#timerFab");
  const fabTimeDisplay = $("#timerFabTime");
  const interfaceOverlay = $("#timerInterfaceOverlay");
  const btnCloseInterface = $("#btnCloseTimerInterface");

  const display = $("#timerDisplay");
  const btnStart = $("#btnTimerStart");
  const btnStop = $("#btnTimerStop");
  const presetBtns = document.querySelectorAll(".timer-preset-btn");
  const customInput = $("#timerCustomInput") as HTMLInputElement;
  const btnSet = $("#btnTimerSet");

  const alarmOverlay = $("#timerAlarmOverlay");
  const btnCloseAlarm = $("#btnTimerAlarmClose");

  // Load Saved FAB Position
  if (fab) {
    const savedPos = localStorage.getItem("timerFabPos");
    if (savedPos) {
      try {
        const { x, y } = JSON.parse(savedPos);
        fab.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        fab.setAttribute('data-x', x);
        fab.setAttribute('data-y', y);
      } catch (e) {}
    }

    // Drag Logic
    fab.addEventListener("pointerdown", (e) => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const tX = parseFloat(fab.getAttribute('data-x') || '0');
      const tY = parseFloat(fab.getAttribute('data-y') || '0');
      initialX = e.clientX - tX;
      initialY = e.clientY - tY;
      fab.setPointerCapture(e.pointerId);
    });

    fab.addEventListener("pointermove", (e) => {
      if (!fab.hasPointerCapture(e.pointerId)) return;
      if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
        isDragging = true;
      }
      if (isDragging) {
        let currentX = e.clientX - initialX;
        let currentY = e.clientY - initialY;
        fab.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        fab.setAttribute('data-x', currentX.toString());
        fab.setAttribute('data-y', currentY.toString());
      }
    });

    fab.addEventListener("pointerup", (e) => {
      fab.releasePointerCapture(e.pointerId);
      if (isDragging) {
        // Save Position
        const currentX = fab.getAttribute('data-x');
        const currentY = fab.getAttribute('data-y');
        localStorage.setItem("timerFabPos", JSON.stringify({ x: parseFloat(currentX || '0'), y: parseFloat(currentY || '0') }));
      } else {
        // Was a click
        openInterface();
      }
      isDragging = false;
    });

    fab.addEventListener("pointercancel", (e) => {
      fab.releasePointerCapture(e.pointerId);
      isDragging = false;
    });
  }

  // Interface Modal Logic
  function openInterface() {
    interfaceOverlay?.classList.add("open");
  }

  btnCloseInterface?.addEventListener("click", () => {
    interfaceOverlay?.classList.remove("open");
  });

  // Timer Formatting
  function updateDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    // Main Display
    if (display) display.textContent = str;

    // FAB Display update if running
    if (fabTimeDisplay) {
      if (isPlaying || remainingSeconds > 0) {
        fabTimeDisplay.textContent = str;
        fabTimeDisplay.style.display = "inline";
        fab?.classList.add("running");
      } else {
        fabTimeDisplay.style.display = "none";
        fab?.classList.remove("running");
      }
    }
  }

  function setTimer(minutes: number) {
    if (minutes <= 0) return;
    remainingSeconds = minutes * 60;
    updateDisplay();
    display?.classList.remove("flash");
  }

  presetBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const min = parseInt(target.getAttribute("data-min") || "0", 10);
      setTimer(min);
    });
  });

  btnSet?.addEventListener("click", () => {
    const val = parseInt(customInput?.value || "0", 10);
    if (!isNaN(val) && val > 0) {
      setTimer(val);
    }
  });

  btnStart?.addEventListener("click", () => {
    if (remainingSeconds <= 0) return;
    
    if (isPlaying) {
      // Pause
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      isPlaying = false;
      btnStart.textContent = "계속";
      return;
    }
    
    // Start or Resume
    isPlaying = true;
    btnStart.textContent = "일시정지";
    updateDisplay(); // update FAB state
    
    timerInterval = window.setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        updateDisplay();
      }
      
      if (remainingSeconds <= 0) {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        isPlaying = false;
        btnStart.textContent = "시작";
        display?.classList.add("flash");
        updateDisplay(); // Hide FAB time
        
        alarmOverlay?.classList.add("open");
        triggerTimerBuzzer();
      }
    }, 1000);
  });

  btnStop?.addEventListener("click", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isPlaying = false;
    btnStart!.textContent = "시작";
    remainingSeconds = 0;
    updateDisplay();
    display?.classList.remove("flash");
  });

  btnCloseAlarm?.addEventListener("click", () => {
    alarmOverlay?.classList.remove("open");
    display?.classList.remove("flash");
  });
}

function triggerTimerBuzzer() {
  window.go.main.App.GetSettings().then(s => {
    if (s.alarmSound === 'custom' && s.customAlarmData) {
      playCustomAlarm(s.customAlarmData);
    } else {
      const preset = s.alarmSound || 'classic';
      playPresetAlarm(preset, 'start');
      setTimeout(() => playPresetAlarm(preset, 'end'), 1500);
      setTimeout(() => playPresetAlarm(preset, 'start'), 3000);
    }
  }).catch(e => console.error(e));
}
