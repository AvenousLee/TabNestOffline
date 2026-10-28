// Everything that talks to the browser's tab APIs lives here, so supporting
// Edge/Firefox later means changing this one file. Outside the extension
// (npm run dev) it returns sample tabs.

export interface OpenTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

const hasTabs = typeof chrome !== 'undefined' && !!chrome.tabs?.query;

const SAMPLE_TABS: OpenTab[] = [
  { id: 1, title: 'GitHub', url: 'https://github.com/' },
  { id: 2, title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
  { id: 3, title: 'Forgejo', url: 'https://forgejo.org/' },
];

/** Tabs in the current window, skipping browser pages like chrome://newtab. */
export async function currentWindowTabs(): Promise<OpenTab[]> {
  if (!hasTabs) return SAMPLE_TABS;
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((t) => t.url && /^(https?|file|ftp):/i.test(t.url))
    .map((t) => ({ id: t.id ?? -1, title: t.title || t.url!, url: t.url!, favIconUrl: t.favIconUrl }));
}

export function onTabsChanged(cb: () => void): () => void {
  if (!hasTabs) return () => {};
  const events = [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onMoved, chrome.tabs.onActivated];
  events.forEach((e) => (e as chrome.events.Event<() => void>).addListener(cb));
  return () => events.forEach((e) => (e as chrome.events.Event<() => void>).removeListener(cb));
}

export async function openUrl(url: string, opts: { newTab: boolean }): Promise<void> {
  if (!hasTabs) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  if (opts.newTab) await chrome.tabs.create({ url, active: false });
  else await chrome.tabs.update({ url });
}

export async function openMany(urls: string[], inNewWindow: boolean): Promise<void> {
  if (!hasTabs) {
    urls.forEach((u) => window.open(u, '_blank', 'noopener'));
    return;
  }
  if (inNewWindow) await chrome.windows.create({ url: urls });
  else for (const url of urls) await chrome.tabs.create({ url, active: false });
}

export async function focusTab(id: number): Promise<void> {
  if (!hasTabs) return;
  const tab = await chrome.tabs.update(id, { active: true });
  if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
}

export async function closeTab(id: number): Promise<void> {
  if (hasTabs) await chrome.tabs.remove(id);
}

/** Favicon for a URL. Uses Chrome's built-in favicon cache (no third-party service). */
export function faviconFor(pageUrl: string, fallback?: string): string | undefined {
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
  }
  return fallback;
}

async function faviconData(pageUrl: string): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return null;
  const res = await fetch(faviconFor(pageUrl)!);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Loads site icons from Chrome's favicon cache as data URLs. Gives null when
 * Chrome has no icon for the site (it would hand back its generic globe).
 */
export function faviconLoader(): (pageUrl: string) => Promise<string | null> {
  let blank: Promise<string | null> | undefined;
  return async (pageUrl) => {
    blank ??= faviconData('https://no-icon.invalid/').catch(() => null);
    const [none, data] = await Promise.all([blank, faviconData(pageUrl)]);
    return data && data !== none ? data : null;
  };
}

/** Number on the toolbar icon = spaces with updates waiting for a decision. */
export function setBadge(count: number): void {
  if (typeof chrome === 'undefined' || !chrome.action) return;
  void chrome.action.setBadgeText({ text: count ? String(count) : '' });
  void chrome.action.setBadgeBackgroundColor({ color: '#d64c78' });
}

/** Ask for access to a git server (needed before syncing with a self-hosted Forgejo). Must run from a click. */
export async function requestHostAccess(origin: string | string[]): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions) return true;
  // Call request() straight away: awaiting anything first can lose the click
  // "gesture" Chrome requires. If access is already granted it returns true without a prompt.
  const origins = (Array.isArray(origin) ? origin : [origin]).map((o) => `${o.replace(/\/+$/, '')}/*`);
  return chrome.permissions.request({ origins });
}
