/**
 * Release build script:
 * 1. Read version from package.json and sync to NSIS script
 * 2. electrobun build --env=stable
 *    (Electrobun automatically runs scripts/post-build.ts as postBuild hook,
 *     which: embeds manifest, copies bg images, embeds icon via local rcedit)
 *    Ignore exit code 1: Electrobun's own rcedit uses a CI-only path.
 * 3. NSIS installer compilation (wraps Wall-E-Setup.exe)
 * 4. Apply icon to NSIS setup.exe
 * 5. List artifacts to upload to GitHub Releases
 */

import { spawnSync } from "child_process";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";

const root = join(import.meta.dir, "..");

// ===== Read version from package.json =====
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const version: string = pkg.version;
console.log(`\nVersion: ${version}`);

// ===== Sync version to NSIS script =====
const nsiPath = join(root, "installer", "wall-e.nsi");
if (existsSync(nsiPath)) {
  let nsi = readFileSync(nsiPath, "utf-8");
  const replaced = nsi.replace(
    /^(!define APP_VERSION\s+)"[^"]*"/m,
    `$1"${version}"`
  );
  if (replaced !== nsi) {
    writeFileSync(nsiPath, replaced, "utf-8");
    console.log(`Synced APP_VERSION to "${version}" in wall-e.nsi`);
  } else {
    console.log(`NSIS APP_VERSION already set to "${version}"`);
  }
}

// ===== Sync version to electrobun.config.ts =====
const configPath = join(root, "electrobun.config.ts");
if (existsSync(configPath)) {
  let config = readFileSync(configPath, "utf-8");
  const replaced = config.replace(
    /version:\s*"[^"]*"/,
    `version: "${version}"`
  );
  if (replaced !== config) {
    writeFileSync(configPath, replaced, "utf-8");
    console.log(`Synced electrobun.config.ts version to "${version}"`);
  }
}

// ===== Sync version to src/bun/index.ts =====
const indexPath = join(root, "src", "bun", "index.ts");
if (existsSync(indexPath)) {
  let indexTs = readFileSync(indexPath, "utf-8");
  const replaced = indexTs.replace(
    /const APP_VERSION = "[^"]*"/,
    `const APP_VERSION = "${version}"`
  );
  if (replaced !== indexTs) {
    writeFileSync(indexPath, replaced, "utf-8");
    console.log(`Synced APP_VERSION in index.ts to "${version}"`);
  }
}

function run(cmd: string, args: string[], { ignoreError = false } = {}): void {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: true });
  const code = result.status ?? 1;
  if (code !== 0) {
    if (ignoreError) {
      console.warn(`  exited with code ${code} (ignored)`);
    } else {
      console.error(`  exited with code ${code}`);
      process.exit(code);
    }
  }
}

const electrobun = join(root, "node_modules", ".bin", "electrobun.exe");
const rcedit = join(root, "node_modules", "rcedit", "bin", "rcedit-x64.exe");
const setupExe = join(root, "installer", `Wall-E-${version}-Setup.exe`);
const iconPath = join(root, "assets", "icon.ico");

// 1. Electrobun build + postBuild hook (ignore Electrobun's rcedit CI-path error)
run(electrobun, ["build", "--env=stable"], { ignoreError: true });

// 2. NSIS installer
run("makensis", ["installer\\wall-e.nsi"]);

// 3. Apply icon to final setup.exe (rcedit may fail in some environments - non-fatal)
run(rcedit, [setupExe, "--set-icon", iconPath], { ignoreError: true });

// ===== List artifacts for GitHub Release =====
const buildDir = join(root, "build", "stable-win-x64", "Wall-E");
const artifactsDir = join(buildDir, "artifacts");

console.log("\n--- Release build complete! ---");
console.log(`\nArtifacts to upload to GitHub Release (tag: v${version}):\n`);

if (existsSync(artifactsDir)) {
  const artifacts = readdirSync(artifactsDir);
  for (const file of artifacts) {
    console.log(`  ${join(artifactsDir, file)}`);
  }
}

if (existsSync(setupExe)) {
  console.log(`  ${setupExe}`);
}

console.log(`\nGitHub Release command:`);
console.log(`  gh release create v${version} --title "v${version}" --generate-notes \\`);
if (existsSync(artifactsDir)) {
  const artifacts = readdirSync(artifactsDir);
  for (const file of artifacts) {
    console.log(`    "${join(artifactsDir, file)}" \\`);
  }
}
if (existsSync(setupExe)) {
  console.log(`    "${setupExe}"`);
}
