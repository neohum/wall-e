/**
 * Post-build script: embeds bun.exe.manifest into bun.exe using rcedit.
 * This manifest enables UTF-8 as the active code page for the process,
 * fixing Korean text rendering in native Windows menus (tray, etc.).
 *
 * When run by Electrobun's postBuild hook, uses ELECTROBUN_* env vars.
 * When run manually: bun scripts/post-build.ts [env]
 */
import { existsSync } from "fs";
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
  binDir = join(projectRoot, "build", `${env}-win-x64`, `Wall-E-${env}`, "bin");
}

const bunExePath = join(binDir, "bun.exe");

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
  const { copyFileSync } = require("fs");
  copyFileSync(manifestPath, join(binDir, "bun.exe.manifest"));
  console.log(`Copied external bun.exe.manifest to ${binDir}`);
}
