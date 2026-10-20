import { describe, expect, it } from 'vitest';
import type { Remote, Space, SpaceFile, UpdatePolicy } from '../types';
import { decide, mergeSyncResult, resolvePending, syncSpace, type SyncIO } from './engine';
import { hashContent, serializeSpaceFile, toSpaceFile } from '../lib/spaceFile';

const space = (cards: string[], policy: UpdatePolicy = 'ask', extra: Partial<Space> = {}): Space => ({
  id: 's1',
  name: 'Work',
  color: '#d64c78',
  updatedAt: '2026-01-01T00:00:00.000Z',
  share: { mode: 'snapshot' },
  collections: [{ id: 'c1', name: 'Tools', cards: cards.map((u, i) => ({ id: `k${i}`, title: u, url: `https://${u}/` })) }],
  sync: { target: { type: 'repo', remoteId: 'r1', path: 'spaces/work.json' }, policy, autoPush: true },
  ...extra,
});

/** A fake git server holding one file. */
function fakeServer(initial?: Space) {
  let file: { sha: string; text: string } | null = initial ? { sha: 'sha-0', text: serializeSpaceFile(toSpaceFile(initial)) } : null;
  let n = 0;
  const pushes: string[] = [];
  const io: SyncIO = {
    fetch: async () => file,
    push: async (_s, _r, text, sha) => {
      if ((file?.sha ?? undefined) !== sha) throw new Error('409 conflict');
      file = { sha: `sha-${++n}`, text };
      pushes.push(text);
      return file.sha;
    },
  };
  return {
    io,
    pushes,
    /** Someone else edits the space on another device. */
    remoteEdit(s: Space) {
      file = { sha: `sha-${++n}`, text: serializeSpaceFile(toSpaceFile(s)) };
    },
    get file() {
      return file;
    },
  };
}

const remotes: Remote[] = [];

describe('decide', () => {
  const f = { format: 'tabnest.space', version: 1, id: 's1', updatedAt: '', content: { name: '', color: '', collections: [] } } as SpaceFile;
  const remote = (sha: string, hash: string) => ({ sha, hash, file: f });

  it('treats identical content as up to date', () => {
    expect(decide({ localHash: 'a', localIsEmpty: false, base: { sha: 'x', hash: 'a' }, remote: remote('x', 'a'), readOnly: false }).kind).toBe('up-to-date');
  });
  it('adopts when content matches but version differs', () => {
    expect(decide({ localHash: 'a', localIsEmpty: false, remote: remote('x', 'a'), readOnly: false }).kind).toBe('adopt');
  });
  it('pushes local-only changes', () => {
    expect(decide({ localHash: 'b', localIsEmpty: false, base: { sha: 'x', hash: 'a' }, remote: remote('x', 'a'), readOnly: false }).kind).toBe('push');
  });
  it('does not push from a read-only target', () => {
    expect(decide({ localHash: 'b', localIsEmpty: false, base: { sha: 'x', hash: 'a' }, remote: remote('x', 'a'), readOnly: true }).kind).toBe('local-only');
  });
  it('flags remote-only changes as updates', () => {
    expect(decide({ localHash: 'a', localIsEmpty: false, base: { sha: 'x', hash: 'a' }, remote: remote('y', 'c'), readOnly: false }).kind).toBe('remote-update');
  });
  it('flags changes on both sides as a conflict', () => {
    expect(decide({ localHash: 'b', localIsEmpty: false, base: { sha: 'x', hash: 'a' }, remote: remote('y', 'c'), readOnly: false }).kind).toBe('conflict');
  });
  it('first link: empty local takes remote, non-empty local asks', () => {
    expect(decide({ localHash: 'e', localIsEmpty: true, remote: remote('y', 'c'), readOnly: false }).kind).toBe('remote-update');
    expect(decide({ localHash: 'b', localIsEmpty: false, remote: remote('y', 'c'), readOnly: false }).kind).toBe('conflict');
  });
  it('imported space (content-only base): remote change is an update, not a conflict', () => {
    const base = { sha: '', hash: 'a' };
    expect(decide({ localHash: 'a', localIsEmpty: false, base, remote: remote('y', 'c'), readOnly: true }).kind).toBe('remote-update');
    // Local edits while the source is unchanged stay local.
    expect(decide({ localHash: 'b', localIsEmpty: false, base, remote: remote('y', 'a'), readOnly: true }).kind).toBe('local-only');
    expect(decide({ localHash: 'b', localIsEmpty: false, base, remote: remote('y', 'c'), readOnly: true }).kind).toBe('conflict');
  });
  it('reports a missing remote file', () => {
    expect(decide({ localHash: 'a', localIsEmpty: false, remote: null, readOnly: false }).kind).toBe('missing');
  });
});

describe('syncSpace', () => {
  it('uploads a new space, then is up to date', async () => {
    const server = fakeServer();
    const r1 = await syncSpace(space(['a.com']), remotes, { manual: false }, server.io);
    expect(r1.message).toBe('Uploaded to git.');
    expect(server.pushes).toHaveLength(1);
    const r2 = await syncSpace(r1.space, remotes, { manual: false }, server.io);
    expect(r2.message).toBe('Up to date.');
    expect(server.pushes).toHaveLength(1);
  });

  it('auto policy pulls remote updates', async () => {
    const server = fakeServer();
    const mine = (await syncSpace(space(['a.com'], 'auto'), remotes, { manual: false }, server.io)).space;
    server.remoteEdit({ ...mine, collections: [{ id: 'c1', name: 'Tools', cards: [{ id: 'z', title: 'b', url: 'https://b.com/' }] }], updatedAt: '2026-02-01T00:00:00.000Z' });
    const r = await syncSpace(mine, remotes, { manual: false }, server.io);
    expect(r.pending).toBeNull();
    expect(r.space.collections[0].cards[0].url).toBe('https://b.com/');
    expect(r.space.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('ask policy creates a prompt, ignore policy stays quiet until a manual check', async () => {
    const server = fakeServer();
    const mine = (await syncSpace(space(['a.com'], 'ask'), remotes, { manual: false }, server.io)).space;
    server.remoteEdit(space(['b.com']));
    const ask = await syncSpace(mine, remotes, { manual: false }, server.io);
    expect(ask.pending?.kind).toBe('remote-update');
    expect(ask.space.collections[0].cards[0].url).toBe('https://a.com/');

    const quiet = { ...mine, sync: { ...mine.sync!, policy: 'ignore' as const } };
    const ign = await syncSpace(quiet, remotes, { manual: false }, server.io);
    expect(ign.pending).toBeNull();
    expect(ign.space.sync?.ignoredSha).toBe(server.file!.sha);
    const manual = await syncSpace(ign.space, remotes, { manual: true }, server.io);
    expect(manual.pending?.kind).toBe('remote-update');
  });

  it('never overwrites when both sides changed', async () => {
    const server = fakeServer();
    const mine = (await syncSpace(space(['a.com'], 'auto'), remotes, { manual: false }, server.io)).space;
    server.remoteEdit(space(['theirs.com']));
    const edited = { ...mine, collections: [{ ...mine.collections[0], cards: [{ id: 'm', title: 'mine', url: 'https://mine.com/' }] }] };
    const r = await syncSpace(edited, remotes, { manual: false }, server.io);
    expect(r.pending?.kind).toBe('conflict');
    expect(server.pushes).toHaveLength(1); // only the initial upload

    const kept = await resolvePending(r.space, r.pending!, 'keep-mine', remotes, server.io);
    expect(server.file!.text).toContain('mine.com');
    expect(kept.sync?.base?.sha).toBe(server.file!.sha);
  });

  it('respects auto-upload off', async () => {
    const server = fakeServer();
    const s = space(['a.com']);
    const r = await syncSpace({ ...s, sync: { ...s.sync!, autoPush: false } }, remotes, { manual: false }, server.io);
    expect(server.pushes).toHaveLength(0);
    expect(r.message).toMatch(/Sync now/);
  });

  it('records errors instead of throwing', async () => {
    const io: SyncIO = { fetch: async () => { throw new Error('offline'); }, push: async () => '' };
    const r = await syncSpace(space(['a.com']), remotes, { manual: false }, io);
    expect(r.space.sync?.lastError).toBe('offline');
  });
});

describe('mergeSyncResult', () => {
  it('keeps edits made while a push was in flight', async () => {
    const snap = space(['a.com']);
    const pushed = { ...snap, sync: { ...snap.sync!, base: { sha: 'sha-1', hash: await hashContent(snap) } } };
    const edited = { ...snap, updatedAt: '2026-03-01T00:00:00.000Z', collections: [{ ...snap.collections[0], cards: [] }] };
    const merged = await mergeSyncResult(edited, snap, pushed);
    expect(merged?.collections[0].cards).toHaveLength(0);
    expect(merged?.sync?.base?.sha).toBe('sha-1');
  });

  it('drops a pull if the user edited meanwhile', async () => {
    const snap = space(['a.com']);
    const pulled = space(['b.com']);
    const edited = { ...snap, updatedAt: '2026-03-01T00:00:00.000Z', collections: [] };
    expect(await mergeSyncResult(edited, snap, pulled)).toBeNull();
  });
});

describe('following a repo (pull only)', () => {
  it('never uploads, even when edited locally or the file is missing', async () => {
    const server = fakeServer(space(['a.com']));
    const s = space(['a.com'], 'auto');
    const follower = { ...s, sync: { ...s.sync!, target: { type: 'repo' as const, remoteId: 'r1', path: 'spaces/work.json', follow: true } } };
    const first = await syncSpace(follower, remotes, { manual: true }, server.io);
    expect(first.message).toBe('Up to date.');
    const edited = { ...first.space, collections: [{ ...first.space.collections[0], cards: [] }] };
    const r = await syncSpace(edited, remotes, { manual: true }, server.io);
    expect(r.message).toMatch(/stay on this device/);
    expect(server.pushes).toHaveLength(0);
    const gone = await syncSpace(follower, remotes, { manual: true }, fakeServer().io);
    expect(gone.space.sync?.lastError).toMatch(/not found/);
  });
});
