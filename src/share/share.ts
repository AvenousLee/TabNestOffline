// Offline sharing: export spaces as a single self-contained HTML file that
// anyone can open in a browser, and import such files (or space .json files) back.

import type { Profile, Remote, ShareBundle, SharedSpace, Space } from '../types';
import { toSpaceFile, validateSpaceFile } from '../lib/spaceFile';
import { nowIso } from '../lib/util';
import { rawFileUrl, sourcePageUrl } from '../sync/providers';
import { looksLikeToby, parseToby } from './toby';
import viewerCss from './viewer.css?raw';
import viewerJs from './viewer.js?raw';

/** URL a shared file should check for updates, or undefined for a snapshot. */
export function resolveCheckUrl(space: Space, remotes: Remote[]): string | undefined {
  if (space.share.mode !== 'check') return undefined;
  if (space.share.checkUrl?.trim()) return space.share.checkUrl.trim();
  const t = space.sync?.target;
  if (t?.type === 'url') return t.url;
  if (t?.type === 'repo') {
    const remote = remotes.find((r) => r.id === t.remoteId);
    if (remote) return rawFileUrl(remote, t.path);
  }
  return undefined;
}

/** Web page of the space's git file, so readers with access can sign in and look. */
export function resolveSourceUrl(space: Space, remotes: Remote[]): string | undefined {
  const t = space.sync?.target;
  if (space.share.mode !== 'check' || t?.type !== 'repo') return undefined;
  const remote = remotes.find((r) => r.id === t.remoteId);
  return remote ? sourcePageUrl(remote, t.path) : undefined;
}

export function buildBundle(spaces: Space[], remotes: Remote[], sharedBy?: Profile): ShareBundle {
  const bundle: ShareBundle = {
    format: 'tabnest.share',
    version: 1,
    exportedAt: nowIso(),
    spaces: spaces.map((s) => {
      const out: SharedSpace = toSpaceFile(s);
      const checkUrl = resolveCheckUrl(s, remotes);
      const sourceUrl = resolveSourceUrl(s, remotes);
      if (checkUrl) out.checkUrl = checkUrl;
      if (sourceUrl) out.sourceUrl = sourceUrl;
      return out;
    }),
  };
  if (sharedBy?.name.trim() || sharedBy?.contact.trim()) bundle.sharedBy = { name: sharedBy.name.trim(), contact: sharedBy.contact.trim() };
  return bundle;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** JSON that is safe inside a <script> tag (escaping < prevents an early </script> or <!--). */
const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

export function buildShareHtml(bundle: ShareBundle): string {
  const title = bundle.spaces.length === 1 ? bundle.spaces[0].content.name : `${bundle.spaces.length} shared spaces`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="TabNest">
<title>${escapeHtml(title)} · TabNest</title>
<style>${viewerCss}</style>
</head>
<body>
<div id="app"></div>
<noscript>Turn on JavaScript to view these links.</noscript>
<script type="application/json" id="tabnest-data">${scriptJson(bundle)}</script>
<script>${viewerJs}</script>
</body>
</html>
`;
}

/** File name without extension: the space's name (or "TabNest spaces" for several). */
export function shareBaseName(spaces: Space[]): string {
  const base = spaces.length === 1 ? spaces[0].name : 'TabNest spaces';
  return base.replace(/[\\/:*?"<>|]+/g, '').trim() || 'space';
}

export function shareFileName(spaces: Space[]): string {
  return `${shareBaseName(spaces)}.html`;
}

/** Read a shared .html file, a space .json file, a bundle .json, or a Toby export. Returns the spaces inside. */
export function parseImport(text: string): SharedSpace[] {
  let jsonText = text.trim();
  if (jsonText.startsWith('<')) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const el = doc.getElementById('tabnest-data');
    if (!el?.textContent) throw new Error('This HTML file was not made by TabNest.');
    jsonText = el.textContent;
  }
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('Could not read the file (not valid JSON or HTML).');
  }
  const d = data as { format?: string; spaces?: unknown[] };
  if (d.format === 'tabnest.share' && Array.isArray(d.spaces)) {
    return d.spaces.map((s) => {
      const checkUrl = (s as { checkUrl?: unknown }).checkUrl;
      const file = validateSpaceFile(s);
      return typeof checkUrl === 'string' ? { ...file, checkUrl } : file;
    });
  }
  if (looksLikeToby(data)) return parseToby(data);
  return [validateSpaceFile(data)];
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
