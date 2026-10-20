// Sync logic for one space. Works like a tiny git client for a single file:
//
//   base   = the version both sides last agreed on (sha on the server + hash of its content)
//   local  changed?  -> hash(local content) != base.hash
//   remote changed?  -> remote sha != base.sha
//
//   neither          -> up to date
//   only local       -> push (two-way spaces)
//   only remote      -> apply the space's policy: auto = pull, ask = prompt, ignore = remember & stay quiet
//   both             -> conflict, always ask (never silently overwrite someone's work)

import type { PendingUpdate, Remote, Space, SpaceFile } from '../types';
import { hashContent, parseSpaceFile, serializeSpaceFile, toSpaceFile } from '../lib/spaceFile';
import { nowIso } from '../lib/util';
import { fetchTarget, findRemote, putRepoFile, type RemoteFile } from './providers';

export type Decision =
  | { kind: 'up-to-date' }
  /** Both sides already have the same content; just record the shared version. */
  | { kind: 'adopt'; sha: string; hash: string }
  | { kind: 'push'; remoteSha?: string }
  | { kind: 'remote-update'; sha: string; hash: string; file: SpaceFile }
  | { kind: 'conflict'; sha: string; hash: string; file: SpaceFile }
  /** Read-only target and only local edits: nothing to send anywhere. */
  | { kind: 'local-only' }
  /** The target has no file (yet). */
  | { kind: 'missing' };

export interface DecideInput {
  localHash: string;
  localIsEmpty: boolean;
  base?: { sha: string; hash: string };
  remote: { sha: string; hash: string; file: SpaceFile } | null;
  readOnly: boolean;
}

/** Pure decision step (unit tested). */
export function decide({ localHash, localIsEmpty, base, remote, readOnly }: DecideInput): Decision {
  if (!remote) return { kind: 'missing' };
  if (remote.hash === localHash) return base?.sha === remote.sha ? { kind: 'up-to-date' } : { kind: 'adopt', sha: remote.sha, hash: remote.hash };

  if (!base) {
    // First sync for this space. An empty local space just takes the remote; otherwise ask.
    return localIsEmpty ? { kind: 'remote-update', ...remote } : { kind: 'conflict', ...remote };
  }
  const localChanged = localHash !== base.hash;
  // An imported space knows the content it started from but not the server's version id.
  const remoteChanged = base.sha ? remote.sha !== base.sha : remote.hash !== base.hash;
  if (!localChanged && !remoteChanged) return { kind: 'up-to-date' };
  if (localChanged && !remoteChanged) return readOnly ? { kind: 'local-only' } : { kind: 'push', remoteSha: remote.sha };
  if (!localChanged && remoteChanged) return { kind: 'remote-update', ...remote };
  return { kind: 'conflict', ...remote };
}

export interface SyncResult {
  space: Space;
  /** A prompt to show the user; null clears any existing prompt for this space. */
  pending: PendingUpdate | null;
  message: string;
}

/** Injected for tests. */
export interface SyncIO {
  fetch: (space: Space, remotes: Remote[]) => Promise<RemoteFile | null>;
  push: (space: Space, remotes: Remote[], text: string, sha: string | undefined) => Promise<string>;
}

export const realIO: SyncIO = {
  fetch: (space, remotes) => fetchTarget(space.sync!.target, remotes),
  push: (space, remotes, text, sha) => {
    const t = space.sync!.target;
    if (t.type !== 'repo' || t.follow) throw new Error('This space follows someone else and is read-only.');
    return putRepoFile(findRemote(t.remoteId, remotes), t.path, text, sha, `TabNest: update "${space.name}"`);
  },
};

/** Pull-only spaces: followed links, or repos you follow instead of own. */
export const isReadOnly = (space: Space) => {
  const t = space.sync?.target;
  return !t || t.type !== 'repo' || !!t.follow;
};
const isEmpty = (space: Space) => space.collections.every((c) => c.cards.length === 0);

/** Replace a space's content with the remote copy. Keeps local settings and collapsed state. */
export function applyRemote(space: Space, file: SpaceFile, sha: string, hash: string): Space {
  const collapsed = new Set(space.collections.filter((c) => c.collapsed).map((c) => c.id));
  return {
    ...space,
    ...file.content,
    collections: file.content.collections.map((c) => ({ ...c, collapsed: collapsed.has(c.id) || undefined })),
    updatedAt: file.updatedAt,
    sync: { ...space.sync!, base: { sha, hash }, ignoredSha: undefined, lastError: undefined, lastCheckedAt: nowIso() },
  };
}

async function doPush(space: Space, remotes: Remote[], remoteSha: string | undefined, io: SyncIO): Promise<Space> {
  const hash = await hashContent(space);
  const sha = await io.push(space, remotes, serializeSpaceFile(toSpaceFile(space)), remoteSha);
  return { ...space, sync: { ...space.sync!, base: { sha, hash }, ignoredSha: undefined, lastError: undefined, lastCheckedAt: nowIso() } };
}

/**
 * Check one space against its target and act on the result.
 * `manual` = the user pressed "Sync now": push even if auto-push is off, and
 * show updates even if the policy is "ignore".
 */
export async function syncSpace(space: Space, remotes: Remote[], opts: { manual: boolean }, io: SyncIO = realIO): Promise<SyncResult> {
  const sync = space.sync;
  if (!sync) return { space, pending: null, message: 'Not synced.' };
  const checked = (s: Space, extra: Partial<typeof sync> = {}): Space => ({
    ...s,
    sync: { ...s.sync!, lastCheckedAt: nowIso(), lastError: undefined, ...extra },
  });

  try {
    const raw = await io.fetch(space, remotes);
    let remote: DecideInput['remote'] = null;
    if (raw) {
      const file = parseSpaceFile(raw.text);
      remote = { sha: raw.sha, hash: await hashContent(file.content), file };
    }
    const localHash = await hashContent(space);
    const d = decide({ localHash, localIsEmpty: isEmpty(space), base: sync.base, remote, readOnly: isReadOnly(space) });

    switch (d.kind) {
      case 'up-to-date':
        return { space: checked(space), pending: null, message: 'Up to date.' };
      case 'adopt':
        return { space: checked(space, { base: { sha: d.sha, hash: d.hash } }), pending: null, message: 'Up to date.' };
      case 'local-only':
        return { space: checked(space), pending: null, message: 'You have local changes (this space is read-only, they stay on this device).' };
      case 'missing':
        if (isReadOnly(space)) throw new Error('The space you follow was not found (wrong file path, or it was removed).');
        if (!sync.autoPush && !opts.manual) return { space: checked(space), pending: null, message: 'Not in the repo yet. Press Sync now to upload it.' };
        return { space: await doPush(space, remotes, undefined, io), pending: null, message: 'Uploaded to git.' };
      case 'push':
        if (!sync.autoPush && !opts.manual) return { space: checked(space), pending: null, message: 'Local changes not uploaded yet (auto-upload is off).' };
        return { space: await doPush(space, remotes, d.remoteSha, io), pending: null, message: 'Changes uploaded.' };
      case 'remote-update':
      case 'conflict': {
        const prompt: PendingUpdate = { spaceId: space.id, kind: d.kind, sha: d.sha, remote: d.file };
        if (!opts.manual && sync.ignoredSha === d.sha) return { space: checked(space), pending: null, message: 'Update ignored.' };
        if (d.kind === 'remote-update' && sync.policy === 'auto') {
          return { space: applyRemote(space, d.file, d.sha, d.hash), pending: null, message: 'Pulled the latest version.' };
        }
        if (sync.policy === 'ignore' && !opts.manual) {
          return { space: checked(space, { ignoredSha: d.sha }), pending: null, message: 'Update available (ignored by setting).' };
        }
        return {
          space: checked(space),
          pending: prompt,
          message: d.kind === 'conflict' ? 'Changed here and on the server. Choose which to keep.' : 'Update available.',
        };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { space: { ...space, sync: { ...sync, lastCheckedAt: nowIso(), lastError: msg } }, pending: null, message: msg };
  }
}

/**
 * A sync runs on a snapshot, and the user may keep editing while it waits on
 * the network. Merge the result into the *current* space without losing edits:
 * - result kept the same content (check/push): keep current content, take the new sync info
 * - result replaced the content (pull): apply only if nothing changed locally meanwhile
 * Returns null if the result should be dropped (it'll be re-checked next time).
 */
export async function mergeSyncResult(current: Space, snapshot: Space, result: Space): Promise<Space | null> {
  // Settings the user may have changed meanwhile win; only the sync bookkeeping comes from the result.
  if (!current.sync || !result.sync) return null;
  const { base, ignoredSha, lastCheckedAt, lastError } = result.sync;
  const sync = { ...current.sync, base, ignoredSha, lastCheckedAt, lastError };

  const unchanged = current.updatedAt === snapshot.updatedAt && (await hashContent(current)) === (await hashContent(snapshot));
  if (unchanged) {
    const collapsed = new Set(current.collections.filter((c) => c.collapsed).map((c) => c.id));
    return {
      ...current,
      name: result.name,
      color: result.color,
      updatedAt: result.updatedAt,
      collections: result.collections.map((c) => ({ ...c, collapsed: collapsed.has(c.id) || undefined })),
      sync,
    };
  }
  if ((await hashContent(result)) === (await hashContent(snapshot))) return { ...current, sync };
  return null;
}

export type Resolution ='take-theirs' | 'keep-mine' | 'ignore';

/** Act on the user's answer to a pending update. */
export async function resolvePending(space: Space, p: PendingUpdate, choice: Resolution, remotes: Remote[], io: SyncIO = realIO): Promise<Space> {
  if (choice === 'take-theirs') return applyRemote(space, p.remote, p.sha, await hashContent(p.remote.content));
  if (choice === 'ignore') return { ...space, sync: { ...space.sync!, ignoredSha: p.sha } };
  // keep-mine: overwrite the server with the local copy (based on the version we just saw).
  if (isReadOnly(space)) return { ...space, sync: { ...space.sync!, ignoredSha: p.sha } };
  return doPush({ ...space, updatedAt: nowIso() }, remotes, p.sha, io);
}
