import { create } from 'zustand';
import type { Card, Collection, PendingUpdate, Prefs, Profile, Remote, SharedSpace, Space, SyncConfig } from '../types';
import { fetchPreviewImage } from '../lib/image';
import * as db from '../storage/storage';
import { newId, nowIso } from '../lib/util';
import { hashContent } from '../lib/spaceFile';
import { isReadOnly, mergePending, mergeSyncResult, replaceBadFile, resolvePending, syncSpace, type Resolution } from '../sync/engine';
import { matchRemoteForUrl } from '../sync/providers';
import { setBadge } from '../browser/tabs';

import { SPACE_COLORS } from '../lib/colors';
export { SPACE_COLORS };

/** Don't re-check a space on every new tab; at most this often (background checks run every 15 min). */
const OPEN_CHECK_INTERVAL_MS = 2 * 60 * 1000;
const AUTO_PUSH_DELAY_MS = 3000;

export interface NewCard {
  title: string;
  url: string;
  favIconUrl?: string;
  note?: string;
  image?: string;
}

interface State {
  ready: boolean;
  spaces: Space[];
  remotes: Remote[];
  pending: PendingUpdate[];
  activeSpaceId?: string;
  profile: Profile;
  prefs: Prefs;
  query: string;
  syncing: Record<string, boolean>;
  syncMessage: Record<string, string>;
  /** What happened in the last merge (clashes etc.), shown until dismissed. */
  mergeNotes: Record<string, string[]>;
  toast?: string;

  init(): Promise<void>;
  reload(): Promise<void>;
  setQuery(q: string): void;
  showToast(msg: string): void;

  setActive(id: string): void;
  addSpace(name: string, color?: string): string;
  updateSpaceMeta(id: string, patch: Partial<Pick<Space, 'name' | 'color'>>): void;
  updateSpaceSettings(id: string, patch: { sync?: SyncConfig | null; share?: Space['share'] }): void;
  deleteSpace(id: string): void;
  moveSpace(id: string, toIndex: number): void;

  addCollection(spaceId: string, name: string, cards?: NewCard[], index?: number): string;
  renameCollection(spaceId: string, colId: string, name: string): void;
  deleteCollection(spaceId: string, colId: string): void;
  toggleCollapsed(spaceId: string, colId: string): void;
  moveCollection(spaceId: string, colId: string, toIndex: number): void;

  addCard(spaceId: string, colId: string, card: NewCard, index?: number): void;
  updateCard(spaceId: string, colId: string, cardId: string, patch: Partial<Card>): void;
  deleteCard(spaceId: string, colId: string, cardId: string): void;
  moveCard(from: { spaceId: string; colId: string; cardId: string }, to: { spaceId: string; colId?: string; index?: number }): void;

  saveRemote(remote: Remote): void;
  deleteRemote(id: string): void;

  syncNow(spaceId: string, manual?: boolean): Promise<void>;
  resolve(spaceId: string, choice: Resolution | 'keep-both' | 'merge'): Promise<void>;
  dismissMergeNotes(spaceId: string): void;
  /** Mark spaces that have no owner yet as yours (done when you share them). */
  claimOwnership(spaceIds: string[], me: Profile): void;
  replaceRemoteFile(spaceId: string): Promise<void>;
  importSpaces(files: SharedSpace[], follow: boolean): Promise<string[]>;
  saveProfile(p: Profile): void;
  savePrefs(p: Prefs): void;
}

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let initStarted = false;

const blankSpace = (name: string, color: string): Space => ({
  id: newId(),
  name,
  color,
  collections: [],
  updatedAt: nowIso(),
  share: { mode: 'snapshot' },
});

export const useStore = create<State>()((set, get) => {
  /** Replace a space, save it, and (for content edits) bump its version and schedule an upload. */
  function commitSpace(next: Space, contentChanged: boolean) {
    const space = contentChanged ? { ...next, updatedAt: nowIso() } : next;
    set((s) => ({ spaces: s.spaces.map((x) => (x.id === space.id ? space : x)) }));
    void db.saveSpace(space);
    if (contentChanged && space.sync?.autoPush && !isReadOnly(space)) {
      clearTimeout(pushTimers.get(space.id));
      pushTimers.set(space.id, setTimeout(() => void get().syncNow(space.id, false), AUTO_PUSH_DELAY_MS));
    }
  }

  function editSpace(id: string, fn: (s: Space) => Space, contentChanged = true) {
    const space = get().spaces.find((s) => s.id === id);
    if (space) commitSpace(fn(space), contentChanged);
  }

  function editCollections(spaceId: string, fn: (cols: Collection[]) => Collection[], contentChanged = true) {
    editSpace(spaceId, (s) => ({ ...s, collections: fn(s.collections) }), contentChanged);
  }

  function setPending(pending: PendingUpdate[]) {
    set({ pending });
    void db.savePending(pending);
    setBadge(pending.length);
  }

  const persistOrder = () => void db.saveSpaceOrder(get().spaces.map((s) => s.id));

  return {
    ready: false,
    spaces: [],
    remotes: [],
    pending: [],
    profile: { name: '', contact: '' },
    prefs: { autoPreview: false },
    query: '',
    syncing: {},
    syncMessage: {},
    mergeNotes: {},

    async init() {
      if (initStarted) return;
      initStarted = true;
      await get().reload();
      if (get().spaces.length === 0) {
        const id = get().addSpace('Personal', SPACE_COLORS[0]);
        get().addCollection(id, 'Getting started', [
          { title: 'TabNest help: drag tabs from the right into a collection', url: 'https://github.com/' },
        ]);
      }
      set({ ready: true });
      db.onExternalChange(() => void get().reload());
      // Check synced spaces when a new tab opens (throttled).
      for (const s of get().spaces) {
        const last = s.sync?.lastCheckedAt ? new Date(s.sync.lastCheckedAt).getTime() : 0;
        if (s.sync && Date.now() - last > OPEN_CHECK_INTERVAL_MS) void get().syncNow(s.id, false);
      }
    },

    async reload() {
      const snap = await db.loadAll();
      set((s) => ({
        spaces: snap.spaces,
        remotes: snap.remotes,
        pending: snap.pending,
        profile: snap.profile,
        prefs: snap.prefs,
        activeSpaceId: snap.spaces.some((x) => x.id === (s.activeSpaceId ?? snap.activeSpaceId))
          ? (s.activeSpaceId ?? snap.activeSpaceId)
          : snap.spaces[0]?.id,
      }));
    },

    setQuery: (query) => set({ query }),
    showToast(toast) {
      set({ toast });
      setTimeout(() => get().toast === toast && set({ toast: undefined }), 3500);
    },

    setActive(id) {
      set({ activeSpaceId: id, query: '' });
      void db.saveUi({ activeSpaceId: id });
    },

    addSpace(name, color) {
      const space = blankSpace(name, color ?? SPACE_COLORS[get().spaces.length % SPACE_COLORS.length]);
      set((s) => ({ spaces: [...s.spaces, space], activeSpaceId: space.id }));
      void db.saveSpace(space);
      persistOrder();
      void db.saveUi({ activeSpaceId: space.id });
      return space.id;
    },

    updateSpaceMeta: (id, patch) => editSpace(id, (s) => ({ ...s, ...patch })),

    updateSpaceSettings(id, patch) {
      editSpace(
        id,
        (s) => {
          const next = { ...s };
          if (patch.share) next.share = patch.share;
          if (patch.sync === null) delete next.sync;
          else if (patch.sync) next.sync = patch.sync;
          return next;
        },
        false,
      );
      if (patch.sync === null || patch.sync) setPending(get().pending.filter((p) => p.spaceId !== id));
    },

    deleteSpace(id) {
      set((s) => ({ spaces: s.spaces.filter((x) => x.id !== id) }));
      if (get().activeSpaceId === id) get().setActive(get().spaces[0]?.id ?? '');
      void db.deleteSpaceKey(id);
      persistOrder();
      setPending(get().pending.filter((p) => p.spaceId !== id));
    },

    moveSpace(id, toIndex) {
      const spaces = [...get().spaces];
      const from = spaces.findIndex((s) => s.id === id);
      if (from < 0) return;
      const [s] = spaces.splice(from, 1);
      spaces.splice(Math.min(toIndex, spaces.length), 0, s);
      set({ spaces });
      persistOrder();
    },

    addCollection(spaceId, name, cards = [], index) {
      const col: Collection = { id: newId(), name, cards: cards.map((c) => ({ ...c, id: newId() })) };
      editCollections(spaceId, (cols) => {
        const next = [...cols];
        next.splice(index ?? 0, 0, col);
        return next;
      });
      return col.id;
    },

    renameCollection: (spaceId, colId, name) => editCollections(spaceId, (cols) => cols.map((c) => (c.id === colId ? { ...c, name } : c))),
    deleteCollection: (spaceId, colId) => editCollections(spaceId, (cols) => cols.filter((c) => c.id !== colId)),
    toggleCollapsed: (spaceId, colId) =>
      editCollections(spaceId, (cols) => cols.map((c) => (c.id === colId ? { ...c, collapsed: !c.collapsed || undefined } : c)), false),

    moveCollection(spaceId, colId, toIndex) {
      editCollections(spaceId, (cols) => {
        const next = [...cols];
        const from = next.findIndex((c) => c.id === colId);
        if (from < 0) return cols;
        const [c] = next.splice(from, 1);
        next.splice(toIndex > from ? toIndex - 1 : toIndex, 0, c);
        return next;
      });
    },

    addCard(spaceId, colId, card, index) {
      const id = newId();
      editCollections(spaceId, (cols) =>
        cols.map((c) => {
          if (c.id !== colId) return c;
          const cards = [...c.cards];
          cards.splice(index ?? cards.length, 0, { ...card, id });
          return { ...c, cards };
        }),
      );
      // Optional: add the website's preview picture in the background.
      if (get().prefs.autoPreview && !card.image) {
        fetchPreviewImage(card.url)
          .then((image) => {
            const still = get().spaces.find((sp) => sp.id === spaceId)?.collections.find((c) => c.id === colId)?.cards.find((k) => k.id === id);
            if (image && still && !still.image) get().updateCard(spaceId, colId, id, { image });
          })
          .catch(() => {
            /* no preview: page needs login, blocks it, or has none */
          });
      }
    },

    updateCard: (spaceId, colId, cardId, patch) =>
      editCollections(spaceId, (cols) =>
        cols.map((c) => (c.id === colId ? { ...c, cards: c.cards.map((k) => (k.id === cardId ? { ...k, ...patch, id: k.id } : k)) } : c)),
      ),

    deleteCard: (spaceId, colId, cardId) =>
      editCollections(spaceId, (cols) => cols.map((c) => (c.id === colId ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c))),

    moveCard(from, to) {
      const src = get().spaces.find((s) => s.id === from.spaceId);
      const card = src?.collections.find((c) => c.id === from.colId)?.cards.find((k) => k.id === from.cardId);
      if (!card) return;
      const dest = get().spaces.find((s) => s.id === to.spaceId);
      if (!dest) return;

      if (from.spaceId === to.spaceId && to.colId) {
        editCollections(from.spaceId, (cols) => {
          let index = to.index;
          // Removing the card first shifts later positions in the same collection.
          if (from.colId === to.colId && index != null) {
            const at = cols.find((c) => c.id === from.colId)!.cards.findIndex((k) => k.id === from.cardId);
            if (at < index) index--;
          }
          const without = cols.map((c) => (c.id === from.colId ? { ...c, cards: c.cards.filter((k) => k.id !== from.cardId) } : c));
          return without.map((c) => {
            if (c.id !== to.colId) return c;
            const cards = [...c.cards];
            cards.splice(index ?? cards.length, 0, card);
            return { ...c, cards };
          });
        });
        return;
      }
      // Moving to another space: drop into the given collection, else the first one (or a new "Inbox").
      get().deleteCard(from.spaceId, from.colId, from.cardId);
      const colId = to.colId ?? dest.collections[0]?.id ?? get().addCollection(to.spaceId, 'Inbox');
      get().addCard(to.spaceId, colId, card, to.index);
      get().showToast(`Moved “${card.title}” to ${dest.name}`);
    },

    saveRemote(remote) {
      const exists = get().remotes.some((r) => r.id === remote.id);
      const remotes = exists ? get().remotes.map((r) => (r.id === remote.id ? remote : r)) : [...get().remotes, remote];
      set({ remotes });
      void db.saveRemotes(remotes);
      // A new token (or branch) often fixes a failed sync: retry those spaces now.
      for (const sp of get().spaces) {
        const t = sp.sync?.target;
        if (exists && t?.type === 'repo' && t.remoteId === remote.id && sp.sync?.lastError) void get().syncNow(sp.id, true);
      }
    },

    deleteRemote(id) {
      const remotes = get().remotes.filter((r) => r.id !== id);
      set({ remotes });
      void db.saveRemotes(remotes);
    },

    async syncNow(spaceId, manual = true) {
      const snapshot = get().spaces.find((s) => s.id === spaceId);
      if (!snapshot?.sync || get().syncing[spaceId]) return;
      clearTimeout(pushTimers.get(spaceId));
      set((s) => ({ syncing: { ...s.syncing, [spaceId]: true } }));
      try {
        const res = await syncSpace(snapshot, get().remotes, { manual });
        const current = get().spaces.find((s) => s.id === spaceId);
        if (!current) return;
        const merged = await mergeSyncResult(current, snapshot, res.space);
        if (merged) commitSpace(merged, false);
        const others = get().pending.filter((p) => p.spaceId !== spaceId);
        if (res.pending) setPending([...others, res.pending]);
        else if (others.length !== get().pending.length && !res.space.sync?.lastError) setPending(others);
        set((s) => ({ syncMessage: { ...s.syncMessage, [spaceId]: res.message } }));
        if (manual) get().showToast(`${snapshot.name}: ${res.message}`);
        // Edits made while uploading still need uploading.
        if (merged && merged.sync?.base && merged.updatedAt !== res.space.updatedAt && merged.sync.autoPush) {
          pushTimers.set(spaceId, setTimeout(() => void get().syncNow(spaceId, false), AUTO_PUSH_DELAY_MS));
        }
      } finally {
        set((s) => ({ syncing: { ...s.syncing, [spaceId]: false } }));
      }
    },

    async resolve(spaceId, choice) {
      const p = get().pending.find((x) => x.spaceId === spaceId);
      const space = get().spaces.find((s) => s.id === spaceId);
      if (!p || !space) return;
      try {
        if (choice === 'keep-both') {
          // Save my version as a separate, unsynced space, then take theirs here.
          const copy: Space = { ...space, id: newId(), name: `${space.name} (my copy)`, sync: undefined, updatedAt: nowIso() };
          set((s) => ({ spaces: [...s.spaces, copy] }));
          void db.saveSpace(copy);
          persistOrder();
          choice = 'take-theirs';
        }
        if (choice === 'merge') {
          const { space: merged, notes } = await mergePending(space, p, get().remotes);
          commitSpace(merged, false);
          setPending(get().pending.filter((x) => x.spaceId !== spaceId));
          set((st) => ({ mergeNotes: { ...st.mergeNotes, [spaceId]: notes } }));
          get().showToast(notes.length ? 'Merged both versions. See the notes above your collections.' : 'Merged both versions. Nothing clashed.');
          return;
        }
        const next = await resolvePending(space, p, choice, get().remotes);
        commitSpace(next, false);
        setPending(get().pending.filter((x) => x.spaceId !== spaceId));
        get().showToast(choice === 'take-theirs' ? 'Updated to the latest version.' : choice === 'keep-mine' ? 'Your version was uploaded.' : 'Update ignored.');
      } catch (e) {
        get().showToast(e instanceof Error ? e.message : String(e));
      }
    },

    async replaceRemoteFile(spaceId) {
      const space = get().spaces.find((sp) => sp.id === spaceId);
      if (!space?.sync?.badFileSha) return;
      set((st) => ({ syncing: { ...st.syncing, [spaceId]: true } }));
      try {
        commitSpace(await replaceBadFile(space, get().remotes), false);
        get().showToast(`Replaced the file in the repo with “${space.name}”.`);
      } catch (e) {
        get().showToast(e instanceof Error ? e.message : String(e));
      } finally {
        set((st) => ({ syncing: { ...st.syncing, [spaceId]: false } }));
      }
    },

    claimOwnership(spaceIds, me) {
      if (!me.name.trim() && !me.contact.trim()) return;
      for (const id of spaceIds) editSpace(id, (sp) => (sp.owner ? sp : { ...sp, owner: { name: me.name.trim(), contact: me.contact.trim() } }), false);
    },

    dismissMergeNotes(spaceId) {
      set((st) => {
        const next = { ...st.mergeNotes };
        delete next[spaceId];
        return { mergeNotes: next };
      });
    },

    savePrefs(prefs) {
      set({ prefs });
      void db.savePrefs(prefs);
    },

    saveProfile(profile) {
      set({ profile });
      void db.saveProfile(profile);
    },

    async importSpaces(files, follow) {
      const ids: string[] = [];
      for (const f of files) {
        const existing = get().spaces.find((s) => s.id === f.id);
        // Following: remember the imported content as the shared starting point,
        // so the first check shows an update rather than a conflict.
        // If you already have a git remote for that repo, follow through it (works for private repos).
        let sync: SyncConfig | undefined = existing?.sync;
        if (follow && f.checkUrl) {
          const base = { sha: '', hash: await hashContent(f.content), content: f.content };
          const viaRemote = matchRemoteForUrl(f.checkUrl, get().remotes);
          sync = {
            target: viaRemote ? { type: 'repo', remoteId: viaRemote.remote.id, path: viaRemote.path, follow: true } : { type: 'url', url: f.checkUrl },
            policy: 'ask',
            autoPush: false,
            base,
          };
        }
        const space: Space = {
          ...(existing ?? blankSpace(f.content.name, f.content.color)),
          ...f.content,
          id: existing?.id ?? (f.id || newId()),
          updatedAt: f.updatedAt,
          sync,
          share: existing?.share ?? { mode: f.checkUrl ? 'check' : 'snapshot', checkUrl: f.checkUrl },
          owner: existing?.owner ?? f.owner,
        };
        if (existing) set((s) => ({ spaces: s.spaces.map((x) => (x.id === space.id ? space : x)) }));
        else set((s) => ({ spaces: [...s.spaces, space] }));
        void db.saveSpace(space);
        ids.push(space.id);
      }
      persistOrder();
      if (ids[0]) get().setActive(ids[0]);
      return ids;
    },
  };
});

export const activeSpace = (s: State): Space | undefined => s.spaces.find((x) => x.id === s.activeSpaceId) ?? s.spaces[0];
