/**
 * 应用版本与自动更新服务
 * 支持从 GitHub Releases 检查最新版本、获取更新日志，并在客户端内展示或一键更新
 */

export const APP_VERSION = '1.0.0';
export const GITHUB_REPO = 'VipBeCool/writing-master';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  macDownloadUrl?: string;
  windowsDownloadUrl?: string;
}

/** 比较语义化版本号 (例如 "1.0.1" > "1.0.0") */
export function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^[vV]/, '').trim();
  const p1 = clean(v1).split('.').map(Number);
  const p2 = clean(v2).split('.').map(Number);
  const len = Math.max(p1.length, p2.length);

  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

/** 判断当前操作系统平台 */
export function getClientPlatform(): 'mac' | 'windows' | 'other' {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  return 'other';
}

/** 判断是否在 Tauri 桌面应用环境 */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 执行应用内自动更新：下载更新包、自动替换并重启应用 */
export async function performInAppUpdate(
  onProgress?: (percent: number, statusText: string) => void
): Promise<void> {
  if (!isTauriApp()) {
    throw new Error('当前处于浏览器开发环境，无法执行原生客户端自动更新。');
  }

  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');

  onProgress?.(0, '正在连接更新服务器…');
  const update = await check();

  if (!update) {
    throw new Error('未检测到可安装的新版本更新包。');
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  onProgress?.(1, '正在下载更新包…');

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength || 0;
        onProgress?.(2, '开始下载…');
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress?.(pct, `正在下载并安装 ${pct}%…`);
        } else {
          onProgress?.(50, '正在下载更新包…');
        }
        break;
      case 'Finished':
        onProgress?.(100, '下载安装完成，正在准备重启…');
        break;
    }
  });

  onProgress?.(100, '更新完成！正在自动重启应用…');
  // 稍作停顿让用户看到完成状态，随后立即重启进入新版本
  await new Promise((resolve) => setTimeout(resolve, 800));
  await relaunch();
}

/** 在系统浏览器中安全打开外部链接 */
export function openExternalUrl(url: string) {
  if (!url) return;
  try {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch {
    window.open(url, '_blank');
  }
}

/** 检查 GitHub Releases 是否有新版本 */
export async function checkForAppUpdates(): Promise<UpdateInfo> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      // 仓库尚未发布任何 release
      return {
        hasUpdate: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        releaseName: '当前已是最新版',
        releaseNotes: '暂无更新记录。',
        publishedAt: '',
        htmlUrl: `https://github.com/${GITHUB_REPO}/releases`,
      };
    }
    throw new Error(`无法连接到更新服务器 (HTTP ${res.status})`);
  }

  const data = await res.json();
  const rawTag: string = data.tag_name || '';
  const latestVersion = rawTag.replace(/^[vV]/, '');
  const hasUpdate = Boolean(latestVersion && compareVersions(latestVersion, APP_VERSION) > 0);

  let macDownloadUrl: string | undefined;
  let windowsDownloadUrl: string | undefined;

  const assets: any[] = Array.isArray(data.assets) ? data.assets : [];
  for (const asset of assets) {
    const name: string = (asset.name || '').toLowerCase();
    if (name.endsWith('.dmg')) {
      macDownloadUrl = asset.browser_download_url;
    } else if (name.endsWith('.exe') || name.endsWith('.msi')) {
      windowsDownloadUrl = asset.browser_download_url;
    }
  }

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    latestVersion: latestVersion || APP_VERSION,
    releaseName: data.name || rawTag || '新版本更新',
    releaseNotes: data.body || '本次更新包含体验优化与稳定性提升。',
    publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString() : '',
    htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
    macDownloadUrl,
    windowsDownloadUrl,
  };
}

