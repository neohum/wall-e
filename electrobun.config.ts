import type { ElectrobunConfig } from "electrobun";

// Load .env
const envFile = Bun.file(".env");
const envText = await envFile.exists() ? await envFile.text() : "";
const envVars: Record<string, string> = {};
for (const line of envText.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
}

const neisApiKey = envVars.NEIS_API_KEY || "";

const viewDefine = {
  "process.env.NEIS_API_KEY": JSON.stringify(neisApiKey),
};

export default {
  app: {
    name: "Wall-E",
    identifier: "com.wall-e.school-dashboard",
    version: "1.0.0",
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
      define: {
        "process.env.NEIS_API_KEY": JSON.stringify(neisApiKey),
      },
    },
    views: {
      dashboard: {
        entrypoint: "src/dashboard/index.ts",
        define: viewDefine,
      },
      settings: {
        entrypoint: "src/settings/index.ts",
        define: viewDefine,
      },
    },
    copy: {
      "src/dashboard/index.html": "views/dashboard/index.html",
      "src/dashboard/style.css": "views/dashboard/style.css",
      "src/settings/index.html": "views/settings/index.html",
      "src/settings/style.css": "views/settings/style.css",
      "src/dashboard/icon.png": "views/dashboard/icon.png",
      "src/settings/icon.png": "views/settings/icon.png",
      "assets/tray-icon.png": "views/tray-icon.png",
      "assets/tray-icon.ico": "views/tray-icon.ico",
      "assets/icon.ico": "views/icon.ico",
    },
    win: {
      icon: "assets/icon.ico",
    },
  },
  scripts: {
    postBuild: "scripts/post-build.ts",
  },
} satisfies ElectrobunConfig;
