// Backup file: all spaces and settings in one .json, to restore on another
// PC or in another copy of TabNest (e.g. the store version).
//
// Downloaded copies that TabNest fetches again by itself (calendar caches,
// short-lived Google sign-in tokens) are left out. Secrets are left out
// unless the user asks for them: git tokens, and iCal links (a "secret
// address" works like a password).

import type { Remote } from '../types';
import type { CalendarSource } from '../calendar/types';

export interface Backup {
  format: 'tabnest.backup';
  version: 1;
  exportedAt: string;
  withSecrets: boolean;
  data: Record<string, unknown>;
}

const SKIP = [/^calcache:/, /^calgcache:/, /^calgtoken:/, /^lastWrite$/, /^tabnest-print-job$/];

export function makeBackup(all: Record<string, unknown>, withSecrets: boolean, now = new Date()): Backup {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) if (!SKIP.some((re) => re.test(k))) data[k] = v;
  if (!withSecrets) {
    if (Array.isArray(data.remotes)) data.remotes = (data.remotes as Remote[]).map((r) => ({ ...r, token: '' }));
    if (Array.isArray(data.calsources)) data.calsources = (data.calsources as CalendarSource[]).filter((s) => s.kind === 'google');
  }
  return { format: 'tabnest.backup', version: 1, exportedAt: now.toISOString(), withSecrets, data };
}

/** Check a backup file and return what to restore. */
export function readBackup(text: string): Backup {
  let b: Partial<Backup>;
  try {
    b = JSON.parse(text) as Partial<Backup>;
  } catch {
    throw new Error('This is not a TabNest backup file (not valid JSON).');
  }
  if (b?.format !== 'tabnest.backup' || !b.data || typeof b.data !== 'object') {
    throw new Error('This is not a TabNest backup file. (To add a shared space, use “Import shared file” instead.)');
  }
  if (b.version !== 1) throw new Error('This backup was made by a newer TabNest. Update TabNest first.');
  if (!Array.isArray(b.data.spaceOrder)) throw new Error('This backup file is damaged (no list of spaces).');
  return b as Backup;
}

/** "3 spaces, 2 git repositories, 4 calendars" for the restore question. */
export function describeBackup(b: Backup): string {
  const n = (k: string) => (Array.isArray(b.data[k]) ? (b.data[k] as unknown[]).length : 0);
  const plural = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  return [plural(n('spaceOrder'), 'space', 'spaces'), plural(n('remotes'), 'git repository', 'git repositories'), plural(n('calsources'), 'calendar', 'calendars')].join(', ');
}

export const backupFileName = (now = new Date()) => `TabNest backup ${now.toISOString().slice(0, 10)}.json`;
