// ===== Main Entry Point =====
// SPA routing: dashboard + settings overlay

import { initDashboard } from "./dashboard/dashboard";
import { initSettings, openSettings } from "./settings/settings";

async function main(): Promise<void> {
  // Initialize dashboard
  await initDashboard();

  // Initialize settings overlay
  await initSettings();

  // Settings button opens the overlay
  document.getElementById("btnSettings")?.addEventListener("click", () => {
    openSettings();
  });

  // Listen for tray "openSettings" event from Go backend
  window.runtime.EventsOn("openSettings", () => {
    openSettings();
  });

  // Manual button opens the manual overlay
  document.getElementById("btnManual")?.addEventListener("click", () => {
    document.getElementById("helpOverlay")?.classList.add("open");
  });

  const helpOverlay = document.getElementById("helpOverlay");
  document.getElementById("btnCloseHelp")?.addEventListener("click", () => {
    helpOverlay?.classList.remove("open");
  });
  helpOverlay?.addEventListener("click", (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.remove("open");
  });
}

document.addEventListener("DOMContentLoaded", main);
