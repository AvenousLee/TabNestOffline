// Settings the developer can change without a new build: app-config.json in the
// repository (main branch), read from GitHub when Settings → About is opened.
// The last copy read is kept, so it still works offline.

import { ABOUT } from '../about';
import { repoOf } from './updates';

export interface AppConfig {
  /** Form opened by "Send feedback" (https). May contain {version} and {browser}. Empty: no button. */
  feedbackUrl?: string;
}

const CACHE_KEY = 'tabnest:appConfig';

export const appConfigUrl = (repoUrl: string = ABOUT.repoUrl) => `https://raw.githubusercontent.com/${repoOf(repoUrl)}/main/app-config.json`;

/** Only the known fields, and only https links. */
export function cleanConfig(raw: unknown): AppConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const url = typeof r.feedbackUrl === 'string' ? r.feedbackUrl.trim() : '';
  return { feedbackUrl: /^https:\/\/\S+$/i.test(url) ? url : undefined };
}

export function cachedAppConfig(): AppConfig {
  try {
    return cleanConfig(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** The latest config from GitHub; the kept copy if GitHub can't be reached. */
export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch(appConfigUrl(), { cache: 'no-store' });
    if (!res.ok) return cachedAppConfig();
    const config = cleanConfig(await res.json());
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(config));
    } catch {
      /* storage full or blocked: fine without it */
    }
    return config;
  } catch {
    return cachedAppConfig();
  }
}

/** Browser name and version from the user agent, e.g. "Chrome 142 (Windows)". */
export function browserLabel(ua: string = navigator.userAgent): string {
  const edge = /Edg\/(\d+)/.exec(ua);
  const chrome = /Chrome\/(\d+)/.exec(ua);
  const name = edge ? `Edge ${edge[1]}` : chrome ? `Chrome ${chrome[1]}` : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${name} (${os})` : name;
}

/** The form link with {version} and {browser} filled in. */
export function fillLink(url: string, vars: Record<string, string>): string {
  return url.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? encodeURIComponent(vars[key]) : all));
}
