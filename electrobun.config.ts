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
      // Background images (views://bg/<filename>)
      "assets/bg/a-tranquil-sailboat-gliding-across-the-calm-azure-2026-02-28-11-49-53-utc.jpg": "views/bg/a-tranquil-sailboat-gliding-across-the-calm-azure-2026-02-28-11-49-53-utc.jpg",
      "assets/bg/aerial-view-of-a-serene-river-flowing-through-a-de-2026-02-28-11-49-53-utc.jpg": "views/bg/aerial-view-of-a-serene-river-flowing-through-a-de-2026-02-28-11-49-53-utc.jpg",
      "assets/bg/beautiful-morning-view-in-indonesia-panoramic-lan-2026-02-28-10-33-51-utc.jpg": "views/bg/beautiful-morning-view-in-indonesia-panoramic-lan-2026-02-28-10-33-51-utc.jpg",
      "assets/bg/blooming-cherry-blossom-tree-in-spring-with-delic-2026-02-28-12-45-10-utc.jpg": "views/bg/blooming-cherry-blossom-tree-in-spring-with-delic-2026-02-28-12-45-10-utc.jpg",
      "assets/bg/bog-landscape-with-trees-in-swamp-and-mist-retro-2026-01-09-13-53-47-utc.jpg": "views/bg/bog-landscape-with-trees-in-swamp-and-mist-retro-2026-01-09-13-53-47-utc.jpg",
      "assets/bg/broken-brick-wall-urban-building-construction-2026-01-09-13-10-03-utc.jpg": "views/bg/broken-brick-wall-urban-building-construction-2026-01-09-13-10-03-utc.jpg",
      "assets/bg/cordillera-2026-01-07-00-20-41-utc.jpg": "views/bg/cordillera-2026-01-07-00-20-41-utc.jpg",
      "assets/bg/dark-thunderstorm-clouds-rainny-atmosphere-meteor-2026-02-01-06-07-56-utc.jpg": "views/bg/dark-thunderstorm-clouds-rainny-atmosphere-meteor-2026-02-01-06-07-56-utc.jpg",
      "assets/bg/golden-sunshine-sky-tropical-tree-fields-in-sunny-2026-01-25-03-30-41-utc.jpg": "views/bg/golden-sunshine-sky-tropical-tree-fields-in-sunny-2026-01-25-03-30-41-utc.jpg",
      "assets/bg/piano-keyboard-closeup-digital-image-2026-01-08-00-29-44-utc.jpg": "views/bg/piano-keyboard-closeup-digital-image-2026-01-08-00-29-44-utc.jpg",
      "assets/bg/sand-beach-aerial-top-view-of-a-beautiful-sandy-b-2026-01-09-13-04-43-utc.jpg": "views/bg/sand-beach-aerial-top-view-of-a-beautiful-sandy-b-2026-01-09-13-04-43-utc.jpg",
      "assets/bg/wadi-rum-desert-jordan-stars-shine-over-desert-l-2026-01-20-23-17-14-utc.jpg": "views/bg/wadi-rum-desert-jordan-stars-shine-over-desert-l-2026-01-20-23-17-14-utc.jpg",
    },
    win: {
      icon: "assets/icon.ico",
    },
  },
  release: {
    baseUrl: "https://github.com/neohum/wall-e/releases/latest/download",
  },
  scripts: {
    postBuild: "scripts/post-build.ts",
  },
} satisfies ElectrobunConfig;
