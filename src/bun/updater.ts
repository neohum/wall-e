/**
 * GitHub Releases auto-updater for Wall-E.
 *
 * Wraps Electrobun's built-in Updater to work with GitHub Releases.
 * The key idea: GitHub Releases serves files at a predictable URL:
 *   https://github.com/{owner}/{repo}/releases/download/{tag}/{filename}
 *
 * Electrobun's Updater expects a `baseUrl` that it appends artifact names to:
 *   {baseUrl}/{platformPrefix}-update.json
 *   {baseUrl}/{platformPrefix}-{AppName}.tar.zst
 *
 * So we set baseUrl = https://github.com/{owner}/{repo}/releases/download/{tag}
 * and upload the build artifacts (from /artifacts/) as release assets.
 */

// ===== Types =====

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl?: string;
  updateJsonUrl?: string;
  error?: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export interface AutoUpdaterOptions {
  owner: string;
  repo: string;
  currentVersion: string;
  onUpdateAvailable?: (result: UpdateCheckResult) => void;
}

export interface AutoUpdater {
  repo: GitHubRepo;
  currentVersion: string;
  apiUrl: string;
  checkForUpdate(): Promise<UpdateCheckResult>;
  getBaseUrlForRelease(tag: string): string;
  getExpectedArtifactNames(): { updateJson: string; tarball: string };
  downloadAndApply(): Promise<void>;
  startPeriodicCheck(intervalMs: number, callback?: (result: UpdateCheckResult) => void): () => void;
}

// ===== Constants =====

const CHANNEL = "stable";
const OS = "win";
const ARCH = "x64";
const APP_NAME = "Wall-E";
const SANITIZED_APP_NAME = APP_NAME.replace(/ /g, "");

export const PLATFORM_PREFIX = `${CHANNEL}-${OS}-${ARCH}`;

// ===== Pure utility functions =====

/**
 * Parse a GitHub remote URL into owner/repo.
 * Supports HTTPS (https://github.com/owner/repo.git)
 * and SSH (git@github.com:owner/repo.git).
 */
export function parseGitHubRepoFromUrl(url: string): GitHubRepo | null {
  if (!url) return null;

  // HTTPS format
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH format
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

/**
 * Build the GitHub Releases download base URL for a specific tag.
 * This is the URL prefix that Electrobun's Updater will use.
 */
export function getGitHubReleaseBaseUrl(repo: GitHubRepo, tag?: string): string {
  if (tag) {
    return `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}`;
  }
  return `https://github.com/${repo.owner}/${repo.repo}/releases/latest/download`;
}

/**
 * Compare two semver-like version strings.
 * Returns true if `remote` is newer than `current`.
 */
export function isNewerVersion(current: string, remote: string): boolean {
  const normalize = (v: string) => v.replace(/^v/, "");
  const parse = (v: string) => normalize(v).split(".").map(Number);

  const c = parse(current);
  const r = parse(remote);

  if (c.some(isNaN) || r.some(isNaN)) return false;

  const maxLen = Math.max(c.length, r.length);
  for (let i = 0; i < maxLen; i++) {
    const cv = c[i] ?? 0;
    const rv = r[i] ?? 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }

  return false;
}

// ===== AutoUpdater factory =====

export function createAutoUpdater(options: AutoUpdaterOptions): AutoUpdater {
  const repo: GitHubRepo = { owner: options.owner, repo: options.repo };
  const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`;

  const updater: AutoUpdater = {
    repo,
    currentVersion: options.currentVersion,
    apiUrl,

    async checkForUpdate(): Promise<UpdateCheckResult> {
      try {
        const response = await fetch(apiUrl, {
          headers: { "Accept": "application/vnd.github.v3+json" },
        });

        if (!response.ok) {
          return {
            updateAvailable: false,
            latestVersion: options.currentVersion,
            currentVersion: options.currentVersion,
            error: `GitHub API error: HTTP ${response.status}`,
          };
        }

        const release: GitHubRelease = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, "");

        // Find platform-specific assets
        const updateJsonAsset = release.assets.find(
          (a) => a.name === `${PLATFORM_PREFIX}-update.json`
        );
        const tarballAsset = release.assets.find(
          (a) => a.name === `${PLATFORM_PREFIX}-${SANITIZED_APP_NAME}.tar.zst`
        );

        if (!updateJsonAsset) {
          return {
            updateAvailable: false,
            latestVersion,
            currentVersion: options.currentVersion,
            error: `No matching platform asset found (expected ${PLATFORM_PREFIX}-update.json)`,
          };
        }

        const hasUpdate = isNewerVersion(options.currentVersion, latestVersion);

        const result: UpdateCheckResult = {
          updateAvailable: hasUpdate,
          latestVersion,
          currentVersion: options.currentVersion,
          downloadUrl: tarballAsset?.browser_download_url,
          updateJsonUrl: updateJsonAsset.browser_download_url,
        };

        if (hasUpdate && options.onUpdateAvailable) {
          options.onUpdateAvailable(result);
        }

        return result;
      } catch (err) {
        return {
          updateAvailable: false,
          latestVersion: options.currentVersion,
          currentVersion: options.currentVersion,
          error: `Update check failed: ${(err as Error).message}`,
        };
      }
    },

    getBaseUrlForRelease(tag: string): string {
      return getGitHubReleaseBaseUrl(repo, tag);
    },

    getExpectedArtifactNames() {
      return {
        updateJson: `${PLATFORM_PREFIX}-update.json`,
        tarball: `${PLATFORM_PREFIX}-${SANITIZED_APP_NAME}.tar.zst`,
      };
    },

    async downloadAndApply(): Promise<void> {
      // Dynamic import to avoid bundling issues in test environment
      const { Updater } = await import("electrobun/bun");
      await Updater.downloadUpdate();
      await Updater.applyUpdate();
    },

    startPeriodicCheck(intervalMs: number, callback?: (result: UpdateCheckResult) => void): () => void {
      const check = async () => {
        const result = await updater.checkForUpdate();
        if (result.updateAvailable && callback) {
          callback(result);
        }
      };

      // Initial check after 30 seconds
      const initialTimeout = setTimeout(check, 30_000);

      // Periodic checks
      const interval = setInterval(check, intervalMs);

      // Return cleanup function
      return () => {
        clearTimeout(initialTimeout);
        clearInterval(interval);
      };
    },
  };

  return updater;
}
