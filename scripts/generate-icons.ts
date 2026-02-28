/**
 * Generate all icons for Wall-E:
 * - App icons (color, multiple sizes + ICO)
 * - Tray icons (monochrome silhouette, 16/32)
 * - Logo text banner (wide format with text)
 *
 * Usage: bun scripts/generate-icons.ts
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ASSETS_DIR = join(import.meta.dir, "..", "assets");

function renderSvgToPng(svgString: string, width: number, height?: number): Buffer {
  const resvg = new Resvg(svgString, {
    fitTo: height ? { mode: "width", value: width } : { mode: "width", value: width },
    background: "rgba(0,0,0,0)",
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

function buildICO(pngBuffers: Buffer[], sizes: number[]): Buffer {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dataOffset = headerSize + dirEntrySize * numImages;

  let totalDataSize = 0;
  for (const buf of pngBuffers) totalDataSize += buf.length;

  const ico = Buffer.alloc(dataOffset + totalDataSize);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(numImages, 4);

  let offset = dataOffset;
  for (let i = 0; i < numImages; i++) {
    const s = sizes[i];
    const png = pngBuffers[i];
    const e = headerSize + i * dirEntrySize;
    ico.writeUInt8(s >= 256 ? 0 : s, e);
    ico.writeUInt8(s >= 256 ? 0 : s, e + 1);
    ico.writeUInt8(0, e + 2);
    ico.writeUInt8(0, e + 3);
    ico.writeUInt16LE(1, e + 4);
    ico.writeUInt16LE(32, e + 6);
    ico.writeUInt32LE(png.length, e + 8);
    ico.writeUInt32LE(offset, e + 12);
    png.copy(ico, offset);
    offset += png.length;
  }
  return ico;
}

function log(name: string, bytes: number) {
  console.log(`  ${name.padEnd(30)} ${(bytes / 1024).toFixed(1)} KB`);
}

function main() {
  // ===== 1. App Icons (Color) =====
  console.log("=== App Icons (Color) ===");
  const appSvg = readFileSync(join(ASSETS_DIR, "icon.svg"), "utf-8");
  const APP_SIZES = [16, 32, 48, 64, 128, 256, 512];

  for (const size of APP_SIZES) {
    const png = renderSvgToPng(appSvg, size);
    const name = `icon-${size}.png`;
    writeFileSync(join(ASSETS_DIR, name), png);
    log(name, png.length);
  }

  // icon.png (default 256)
  const icon256 = renderSvgToPng(appSvg, 256);
  writeFileSync(join(ASSETS_DIR, "icon.png"), icon256);
  log("icon.png", icon256.length);

  // icon.ico (multi-size)
  const ICO_SIZES = [16, 32, 48, 256];
  const icoPngs = ICO_SIZES.map((s) => renderSvgToPng(appSvg, s));
  const ico = buildICO(icoPngs, ICO_SIZES);
  writeFileSync(join(ASSETS_DIR, "icon.ico"), ico);
  log("icon.ico", ico.length);

  // ===== 2. Tray Icons (Color - same as app icon) =====
  console.log("\n=== Tray Icons (Color) ===");
  const TRAY_SIZES = [16, 20, 24, 32, 48, 64];

  for (const size of TRAY_SIZES) {
    const png = renderSvgToPng(appSvg, size);
    const name = `tray-icon-${size}.png`;
    writeFileSync(join(ASSETS_DIR, name), png);
    log(name, png.length);
  }

  // tray-icon.png (default 32)
  const tray32 = renderSvgToPng(appSvg, 32);
  writeFileSync(join(ASSETS_DIR, "tray-icon.png"), tray32);
  log("tray-icon.png", tray32.length);

  // tray-icon.ico (multi-size for Windows taskbar)
  const TRAY_ICO_SIZES = [16, 20, 24, 32, 48];
  const trayIcoPngs = TRAY_ICO_SIZES.map((s) => renderSvgToPng(appSvg, s));
  const trayIco = buildICO(trayIcoPngs, TRAY_ICO_SIZES);
  writeFileSync(join(ASSETS_DIR, "tray-icon.ico"), trayIco);
  log("tray-icon.ico", trayIco.length);

  // ===== 3. Logo with Text =====
  console.log("\n=== Logo with Text ===");
  const logoSvg = readFileSync(join(ASSETS_DIR, "logo-text.svg"), "utf-8");

  for (const w of [400, 800]) {
    const png = renderSvgToPng(logoSvg, w);
    const name = `logo-text-${w}.png`;
    writeFileSync(join(ASSETS_DIR, name), png);
    log(name, png.length);
  }

  // ===== 4. Taskbar Overlay Icons (small badges) =====
  console.log("\n=== Taskbar Badge Icons ===");
  // In-class (red dot)
  const badgeInClass = makeBadgeSvg("#dc2626");
  const badgeInClassPng = renderSvgToPng(badgeInClass, 16);
  writeFileSync(join(ASSETS_DIR, "badge-in-class.png"), badgeInClassPng);
  log("badge-in-class.png", badgeInClassPng.length);

  // Break (green dot)
  const badgeBreak = makeBadgeSvg("#22c55e");
  const badgeBreakPng = renderSvgToPng(badgeBreak, 16);
  writeFileSync(join(ASSETS_DIR, "badge-break.png"), badgeBreakPng);
  log("badge-break.png", badgeBreakPng.length);

  // Warning (amber dot)
  const badgeWarning = makeBadgeSvg("#ffb703");
  const badgeWarningPng = renderSvgToPng(badgeWarning, 16);
  writeFileSync(join(ASSETS_DIR, "badge-warning.png"), badgeWarningPng);
  log("badge-warning.png", badgeWarningPng.length);

  console.log("\nAll icons generated!");
}

function makeBadgeSvg(color: string): string {
  return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" fill="${color}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

main();
