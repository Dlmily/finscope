export const APP_VERSION = "1.0.1-text";
export const APP_VERSION_CODE = 36;

type ReleaseSource = "GitHub" | "国内加速源";
export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  source: ReleaseSource;
  releaseUrl: string;
  downloadUrl?: string;
  releaseNotes?: string;
};

type GitHubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  body?: unknown;
  assets?: Array<{ name?: unknown; browser_download_url?: unknown }>;
};

const RELEASE_PATH = "repos/Dlmily/finscope/releases/latest";
const SOURCES: Array<{ name: ReleaseSource; apiUrl: string; prefix: string }> = [
  { name: "GitHub", apiUrl: `https://api.github.com/${RELEASE_PATH}`, prefix: "" },
  { name: "国内加速源", apiUrl: `https://gh-proxy.com/https://api.github.com/${RELEASE_PATH}`, prefix: "https://gh-proxy.com/" },
];

function parseVersion(value: unknown) {
  const match = String(value ?? "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left: string, right: string) {
  const a = parseVersion(left) ?? [0, 0, 0];
  const b = parseVersion(right) ?? [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function requestRelease(source: (typeof SOURCES)[number]) {
  const response = await fetch(source.apiUrl, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${source.name} 返回 HTTP ${response.status}`);
  const release = (await response.json()) as GitHubRelease;
  const latestVersion = String(release.tag_name ?? "").replace(/^v/i, "");
  if (!parseVersion(latestVersion)) throw new Error(`${source.name} 返回了无法识别的版本号`);
  const releaseUrl = typeof release.html_url === "string" ? release.html_url : "https://github.com/Dlmily/finscope/releases";
  const apk = (release.assets ?? []).find((asset) => String(asset.name ?? "").toLowerCase().endsWith(".apk"));
  const originalDownloadUrl = typeof apk?.browser_download_url === "string" ? apk.browser_download_url : undefined;
  return {
    currentVersion: APP_VERSION,
    latestVersion,
    hasUpdate: compareVersions(latestVersion, APP_VERSION) > 0,
    source: source.name,
    releaseUrl,
    downloadUrl: originalDownloadUrl ? `${source.prefix}${originalDownloadUrl}` : undefined,
    releaseNotes: typeof release.body === "string" ? release.body : undefined,
  } satisfies UpdateCheckResult;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const results = await Promise.allSettled(SOURCES.map(requestRelease));
  const successful = results.find((result): result is PromiseFulfilledResult<UpdateCheckResult> => result.status === "fulfilled");
  if (successful) return successful.value;
  throw new Error("GitHub 源和国内加速源均暂时不可用，请稍后重试。");
}
