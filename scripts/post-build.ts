/**
 * Post-build script: embeds bun.exe.manifest into bun.exe using rcedit.
 * This manifest enables UTF-8 as the active code page for the process,
 * fixing Korean text rendering in native Windows menus (tray, etc.).
 *
 * When run by Electrobun's postBuild hook, uses ELECTROBUN_* env vars.
 * When run manually: bun scripts/post-build.ts [env]
 */
import { existsSync, copyFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const projectRoot = join(import.meta.dir, "..");
const manifestPath = join(projectRoot, "assets", "bun.exe.manifest");
const rceditPath = join(projectRoot, "node_modules", "rcedit", "bin", "rcedit-x64.exe");

// Determine bin directory
let binDir: string;

if (process.env.ELECTROBUN_BUILD_DIR && process.env.ELECTROBUN_APP_NAME) {
  binDir = join(process.env.ELECTROBUN_BUILD_DIR, process.env.ELECTROBUN_APP_NAME, "bin");
} else {
  const env = process.argv[2] || "dev";
  // Electrobun uses app name ("Wall-E") as folder name, not "Wall-E-{env}"
  binDir = join(projectRoot, "build", `${env}-win-x64`, "Wall-E", "bin");
}

const bunExePath = join(binDir, "bun.exe");
const launcherPath = join(binDir, "launcher.exe");
const iconPath = join(projectRoot, "assets", "icon.ico");

if (!existsSync(bunExePath)) {
  console.error(`bun.exe not found: ${bunExePath}`);
  process.exit(1);
}

if (!existsSync(rceditPath)) {
  console.error(`rcedit not found: ${rceditPath}`);
  process.exit(1);
}

// Embed manifest into bun.exe
const result = spawnSync(rceditPath, [bunExePath, "--application-manifest", manifestPath], {
  stdio: "inherit",
});

if (result.status === 0) {
  console.log(`Embedded UTF-8 manifest into ${bunExePath}`);
} else {
  // rcedit may fail on some bun.exe versions — fall back to external manifest
  console.warn(`rcedit failed (exit code ${result.status}), falling back to external manifest`);
  copyFileSync(manifestPath, join(binDir, "bun.exe.manifest"));
  console.log(`Copied external bun.exe.manifest to ${binDir}`);
}

// Replace libNativeWrapper.dll with patched version (AppendMenuA → AppendMenuW for Unicode menus)
const patchedDllPath = join(projectRoot, "assets", "libNativeWrapper-patched.dll");
const targetDllPath = join(binDir, "libNativeWrapper.dll");

if (existsSync(patchedDllPath) && existsSync(targetDllPath)) {
  copyFileSync(patchedDllPath, targetDllPath);
  console.log(`Replaced libNativeWrapper.dll with Unicode-patched version`);
} else if (!existsSync(patchedDllPath)) {
  console.warn(`Patched DLL not found: ${patchedDllPath}`);
}

// Embed icon into bun.exe and launcher.exe
// (Electrobun's built-in rcedit fails due to hardcoded CI path, so we do it here)
if (existsSync(iconPath)) {
  for (const exe of [bunExePath, launcherPath]) {
    if (!existsSync(exe)) continue;
    const iconResult = spawnSync(rceditPath, [exe, "--set-icon", iconPath], {
      stdio: "inherit",
    });
    if (iconResult.status === 0) {
      console.log(`Embedded icon into ${exe}`);
    } else {
      console.warn(`Failed to embed icon into ${exe} (exit code ${iconResult.status})`);
    }
  }
} else {
  console.warn(`Icon not found: ${iconPath}`);
}

// Copy assets/bg → views/bg (local background images)
const bgSrc = join(projectRoot, "assets", "bg");
const bgDest = join(binDir, "..", "Resources", "app", "views", "bg");

if (existsSync(bgSrc)) {
  mkdirSync(bgDest, { recursive: true });
  const files = readdirSync(bgSrc);
  for (const file of files) {
    copyFileSync(join(bgSrc, file), join(bgDest, file));
  }
  console.log(`Copied ${files.length} background images to views/bg`);
} else {
  console.warn(`bg folder not found: ${bgSrc}`);
}
