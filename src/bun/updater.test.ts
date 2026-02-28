/**
 * TDD tests for GitHub Releases auto-updater module.
 *
 * This module wraps Electrobun's built-in Updater to work with GitHub Releases.
 * It handles:
 *  - Building the correct GitHub Releases download base URL
 *  - Checking for updates via GitHub API
 *  - Version comparison (semver)
 *  - Coordinating the check → download → apply lifecycle
 *  - Periodic background update checks
 *
 * Run: bun test src/bun/updater.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  getGitHubReleaseBaseUrl,
  parseGitHubRepoFromUrl,
  isNewerVersion,
  type GitHubRepo,
  type UpdateCheckResult,
  createAutoUpdater,
  type AutoUpdater,
  PLATFORM_PREFIX,
} from "./updater";

// ============================================================
// Unit tests for pure utility functions
// ============================================================

describe("parseGitHubRepoFromUrl", () => {
  it("parses HTTPS GitHub URL", () => {
    const result = parseGitHubRepoFromUrl("https://github.com/neohum/wall-e.git");
    expect(result).toEqual({ owner: "neohum", repo: "wall-e" });
  });

  it("parses HTTPS GitHub URL without .git", () => {
    const result = parseGitHubRepoFromUrl("https://github.com/neohum/wall-e");
    expect(result).toEqual({ owner: "neohum", repo: "wall-e" });
  });

  it("parses SSH GitHub URL", () => {
    const result = parseGitHubRepoFromUrl("git@github.com:neohum/wall-e.git");
    expect(result).toEqual({ owner: "neohum", repo: "wall-e" });
  });

  it("returns null for non-GitHub URL", () => {
    const result = parseGitHubRepoFromUrl("https://gitlab.com/user/repo.git");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = parseGitHubRepoFromUrl("");
    expect(result).toBeNull();
  });

  it("returns null for malformed URL", () => {
    const result = parseGitHubRepoFromUrl("not-a-url");
    expect(result).toBeNull();
  });
});

describe("getGitHubReleaseBaseUrl", () => {
  it("constructs correct download URL for a specific tag", () => {
    const url = getGitHubReleaseBaseUrl({ owner: "neohum", repo: "wall-e" }, "v1.0.0");
    expect(url).toBe("https://github.com/neohum/wall-e/releases/download/v1.0.0");
  });

  it("constructs correct URL for latest release (no tag)", () => {
    const url = getGitHubReleaseBaseUrl({ owner: "neohum", repo: "wall-e" });
    // Without a tag, it should use the "latest" endpoint
    expect(url).toBe("https://github.com/neohum/wall-e/releases/latest/download");
  });

  it("handles owner/repo with special characters", () => {
    const url = getGitHubReleaseBaseUrl({ owner: "my-org", repo: "my-app" }, "v2.1.0");
    expect(url).toBe("https://github.com/my-org/my-app/releases/download/v2.1.0");
  });
});

describe("isNewerVersion", () => {
  it("detects newer major version", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("detects newer minor version", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("detects newer patch version", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns false for same version", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false for older version", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });

  it("handles versions with v prefix", () => {
    expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true);
  });

  it("handles mixed v prefix", () => {
    expect(isNewerVersion("1.0.0", "v1.0.1")).toBe(true);
    expect(isNewerVersion("v1.0.0", "1.0.1")).toBe(true);
  });

  it("handles two-segment versions", () => {
    expect(isNewerVersion("1.0", "1.1")).toBe(true);
  });

  it("handles single-segment versions", () => {
    expect(isNewerVersion("1", "2")).toBe(true);
  });

  it("returns false for invalid versions", () => {
    expect(isNewerVersion("abc", "def")).toBe(false);
  });
});

describe("PLATFORM_PREFIX", () => {
  it("is stable-win-x64 for this project on Windows", () => {
    // Wall-E uses "stable" channel for releases on Windows x64
    expect(PLATFORM_PREFIX).toBe("stable-win-x64");
  });
});

// ============================================================
// Integration tests for AutoUpdater
// ============================================================

describe("createAutoUpdater", () => {
  it("creates an updater with the correct repo info", () => {
    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });
    expect(updater).toBeDefined();
    expect(updater.repo).toEqual({ owner: "neohum", repo: "wall-e" });
    expect(updater.currentVersion).toBe("1.0.0");
  });
});

describe("AutoUpdater.checkForUpdate", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns no-update when latest release matches current version", async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.0.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: "https://github.com/neohum/wall-e/releases/download/v1.0.0/stable-win-x64-update.json" },
            { name: "stable-win-x64-Wall-E.tar.zst", browser_download_url: "https://github.com/neohum/wall-e/releases/download/v1.0.0/stable-win-x64-Wall-E.tar.zst" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe("1.0.0");
  });

  it("returns update-available when newer release exists", async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.1.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: "https://github.com/neohum/wall-e/releases/download/v1.1.0/stable-win-x64-update.json" },
            { name: "stable-win-x64-Wall-E.tar.zst", browser_download_url: "https://github.com/neohum/wall-e/releases/download/v1.1.0/stable-win-x64-Wall-E.tar.zst" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("1.1.0");
    expect(result.downloadUrl).toContain("v1.1.0");
  });

  it("handles GitHub API errors gracefully", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("Rate limited", { status: 403 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network error");
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("handles release with no matching platform assets", async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.1.0",
          assets: [
            { name: "stable-macos-arm64-update.json", browser_download_url: "https://example.com/macos.json" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("asset");
  });

  it("strips v prefix from tag_name for version comparison", async () => {
    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.0.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: "https://example.com/update.json" },
            { name: "stable-win-x64-Wall-E.tar.zst", browser_download_url: "https://example.com/app.tar.zst" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",  // without v prefix
    });

    const result = await updater.checkForUpdate();
    expect(result.updateAvailable).toBe(false); // same version
  });
});

describe("AutoUpdater.getUpdateJsonUrl", () => {
  it("returns the update.json download URL from latest release", async () => {
    const downloadUrl = "https://github.com/neohum/wall-e/releases/download/v1.1.0/stable-win-x64-update.json";

    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.1.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: downloadUrl },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const result = await updater.checkForUpdate();
    expect(result.updateJsonUrl).toBe(downloadUrl);
  });
});

describe("AutoUpdater version.json baseUrl integration", () => {
  it("getBaseUrlForRelease returns the GitHub download folder URL", () => {
    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    // The base URL that should be written into version.json at build time.
    // Electrobun's Updater appends /{platformPrefix}-update.json to this.
    const baseUrl = updater.getBaseUrlForRelease("v1.1.0");
    expect(baseUrl).toBe("https://github.com/neohum/wall-e/releases/download/v1.1.0");

    // Verify that when Electrobun appends the update.json path, it works:
    const expectedUpdateJsonUrl = `${baseUrl}/stable-win-x64-update.json`;
    expect(expectedUpdateJsonUrl).toBe(
      "https://github.com/neohum/wall-e/releases/download/v1.1.0/stable-win-x64-update.json"
    );
  });
});

describe("AutoUpdater release artifact naming", () => {
  it("expects correct artifact filenames for Wall-E stable build", () => {
    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    const artifacts = updater.getExpectedArtifactNames();
    expect(artifacts.updateJson).toBe("stable-win-x64-update.json");
    expect(artifacts.tarball).toBe("stable-win-x64-Wall-E.tar.zst");
  });
});

describe("AutoUpdater.schedulePeriodicCheck", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls onUpdateAvailable callback when update is found", async () => {
    let callbackCalled = false;
    let callbackResult: UpdateCheckResult | null = null;

    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v2.0.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: "https://example.com/update.json" },
            { name: "stable-win-x64-Wall-E.tar.zst", browser_download_url: "https://example.com/app.tar.zst" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
      onUpdateAvailable: (result) => {
        callbackCalled = true;
        callbackResult = result;
      },
    });

    // Manually trigger a check (instead of waiting for interval)
    await updater.checkForUpdate();

    expect(callbackCalled).toBe(true);
    expect(callbackResult!.updateAvailable).toBe(true);
    expect(callbackResult!.latestVersion).toBe("2.0.0");
  });

  it("does NOT call onUpdateAvailable when no update", async () => {
    let callbackCalled = false;

    globalThis.fetch = mock(async (url: string) => {
      if (url.includes("api.github.com")) {
        return new Response(JSON.stringify({
          tag_name: "v1.0.0",
          assets: [
            { name: "stable-win-x64-update.json", browser_download_url: "https://example.com/update.json" },
            { name: "stable-win-x64-Wall-E.tar.zst", browser_download_url: "https://example.com/app.tar.zst" },
          ],
        }), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as any;

    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
      onUpdateAvailable: () => { callbackCalled = true; },
    });

    await updater.checkForUpdate();
    expect(callbackCalled).toBe(false);
  });
});

describe("AutoUpdater GitHub API URL", () => {
  it("uses correct API endpoint for latest release", () => {
    const updater = createAutoUpdater({
      owner: "neohum",
      repo: "wall-e",
      currentVersion: "1.0.0",
    });

    expect(updater.apiUrl).toBe(
      "https://api.github.com/repos/neohum/wall-e/releases/latest"
    );
  });
});
