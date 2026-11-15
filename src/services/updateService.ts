/**
 * 应用版本与自动更新服务
 * 支持从 GitHub Releases 检查最新版本、获取更新日志，并在客户端内展示或一键更新
 */

export const APP_VERSION = '1.0.5';
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

  await update.download((event) => {
    switch (event.event) {
      case 'Started':
        totalBytes = event.data.contentLength || 0;
        onProgress?.(2, '开始下载…');
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
          onProgress?.(pct, `正在下载更新包 ${pct}%…`);
        } else {
          onProgress?.(50, '正在下载更新包…');
        }
        break;
      case 'Finished':
        onProgress?.(100, '下载完成，正在清理后台模型并释放显存…');
        break;
    }
  });

  // Windows NSIS 安装器在 update.install() 时会直接退出并替换应用，提前终止后台服务树释放显存
  onProgress?.(100, '正在释放后台模型与显存…');
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_managed_services');
  } catch {
    // 非关键错误不阻断后续更新安装
  }

  onProgress?.(100, '正在安装更新并准备重启…');
  await update.install();
  // macOS / Linux 下需要显式重启以切换到新版本（Windows 安装器会自动拉起新版本）
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
  const headers = {
    Accept: 'application/vnd.github.v3+json',
  };
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      // 区分“公开仓库尚未发布任何 Release”与“私有仓库 (Private) 对匿名客户端返回 404”
      const repoRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);

      if (repoRes?.ok) {
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

      if (repoRes?.status === 403) {
        throw new Error('GitHub API 请求频率受限 (HTTP 403)，请稍后再试或前往 GitHub Releases 查看。');
      }

      throw new Error(
        `无法读取 GitHub 更新信息 (HTTP 404)：仓库「${GITHUB_REPO}」当前可能为私有仓库 (Private) 或不可访问，客户端无法免登录检测和下载更新。请将仓库设为 Public，或手动下载安装包升级。`
      );
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

