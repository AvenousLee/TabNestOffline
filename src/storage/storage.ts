// Thin key/value storage. Uses chrome.storage.local inside the extension and
// localStorage when running as a normal web page (npm run dev), so the UI can
// be developed and tested without loading the extension.
//
// Layout:
//   spaceOrder      string[]          ids in sidebar order
//   space:<id>      Space             one key per space (smaller, safer writes)
//   remotes         Remote[]          git accounts/repos (tokens live here, local only)
//   pending         PendingUpdate[]   remote changes waiting for the user
//   ui              { activeSpaceId }
//   profile         Profile           your name/contact shown in shared files
//   prefs           Prefs             personal preferences

import type { PendingUpdate, Prefs, Profile, Remote, Space } from '../types';

export const hasChromeStorage = typeof chrome !== 'undefined' && !!chrome.storage?.local;

const LS_PREFIX = 'tabnest:';

async function getRaw(keys: string[]): Promise<Record<string, unknown>> {
  if (hasChromeStorage) return chrome.storage.local.get(keys);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = localStorage.getItem(LS_PREFIX + k);
    if (v != null) out[k] = JSON.parse(v);
  }
  return out;
}

// Every write is stamped with who made it, so a page can ignore change events
// caused by its own writes and only reload for changes made elsewhere.
const WRITER_ID = Math.random().toString(36).slice(2);
let writeCount = 0;

async function setRaw(items: Record<string, unknown>): Promise<void> {
  if (hasChromeStorage) return chrome.storage.local.set({ ...items, lastWrite: { by: WRITER_ID, n: ++writeCount } });
  for (const [k, v] of Object.entries(items)) localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
}

async function removeRaw(keys: string[]): Promise<void> {
  if (hasChromeStorage) return chrome.storage.local.remove(keys);
  for (const k of keys) localStorage.removeItem(LS_PREFIX + k);
}

export const spaceKey = (id: string) => `space:${id}`;

export interface Snapshot {
  spaces: Space[];
  remotes: Remote[];
  pending: PendingUpdate[];
  activeSpaceId?: string;
  profile: Profile;
  prefs: Prefs;
}

export async function loadAll(): Promise<Snapshot> {
  const { spaceOrder = [], remotes = [], pending = [], ui = {}, profile = { name: '', contact: '' }, prefs = { autoPreview: false } } = (await getRaw([
    'spaceOrder',
    'remotes',
    'pending',
    'ui',
    'profile',
    'prefs',
  ])) as {
    profile?: Profile;
    prefs?: Prefs;
    spaceOrder?: string[];
    remotes?: Remote[];
    pending?: PendingUpdate[];
    ui?: { activeSpaceId?: string };
  };
  const raw = await getRaw(spaceOrder.map(spaceKey));
  const spaces = spaceOrder.map((id) => raw[spaceKey(id)] as Space | undefined).filter((s): s is Space => !!s);
  return { spaces, remotes, pending, activeSpaceId: ui.activeSpaceId, profile, prefs };
}

export async function loadSpace(id: string): Promise<Space | undefined> {
  return (await getRaw([spaceKey(id)]))[spaceKey(id)] as Space | undefined;
}

export const saveSpace = (space: Space) => setRaw({ [spaceKey(space.id)]: space });
export const saveSpaceOrder = (ids: string[]) => setRaw({ spaceOrder: ids });
export const deleteSpaceKey = (id: string) => removeRaw([spaceKey(id)]);
export const saveRemotes = (remotes: Remote[]) => setRaw({ remotes });
export const savePending = (pending: PendingUpdate[]) => setRaw({ pending });
export const savePrefs = (prefs: Prefs) => setRaw({ prefs });
export const saveProfile = (profile: Profile) => setRaw({ profile });
export const saveUi = (ui: { activeSpaceId?: string }) => setRaw({ ui });

export async function loadRemotes(): Promise<Remote[]> {
  return ((await getRaw(['remotes'])).remotes as Remote[] | undefined) ?? [];
}

export async function loadPending(): Promise<PendingUpdate[]> {
  return ((await getRaw(['pending'])).pending as PendingUpdate[] | undefined) ?? [];
}

/** Notify when another part of the extension (e.g. the background worker or another tab) changes storage. */
export function onExternalChange(cb: () => void): () => void {
  if (hasChromeStorage) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      const by = (changes.lastWrite?.newValue as { by?: string } | undefined)?.by;
      if (by !== WRITER_ID) cb();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  const listener = (e: StorageEvent) => e.key?.startsWith(LS_PREFIX) && cb();
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
