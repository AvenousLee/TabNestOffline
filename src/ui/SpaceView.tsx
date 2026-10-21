import { useState } from 'react';
import type { Card, Space } from '../types';
import { useStore } from '../store/store';
import { relativeTime } from '../lib/util';
import { isReadOnly } from '../sync/engine';
import { KIND_NAMES } from '../sync/providers';
import { acceptsDrop, endDrag, readDrop } from './dnd';
import { CollectionView } from './CollectionView';
import { CardView } from './CardView';
import { InlineEdit } from './InlineEdit';
import { Icon } from './icons';

export type CardTarget = { spaceId: string; colId: string; card?: Card };

export function SpaceView({
  space,
  onEditCard,
  onSettings,
  onShare,
  onUpdateToken,
}: {
  space: Space;
  onEditCard: (t: CardTarget) => void;
  onSettings: () => void;
  onShare: () => void;
  onUpdateToken: (remoteId: string) => void;
}) {
  const s = useStore();
  const [newDrop, setNewDrop] = useState(false);
  const tabCount = space.collections.reduce((n, c) => n + c.cards.length, 0);

  if (s.query.trim()) return <SearchResults onEditCard={onEditCard} />;

  const onNewDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setNewDrop(false);
    const item = readDrop(e);
    endDrag();
    if (!item) return;
    const at = space.collections.length;
    if (item.kind === 'tab') s.addCollection(space.id, 'New collection', [{ title: item.title, url: item.url, favIconUrl: item.favIconUrl }], at);
    if (item.kind === 'card') {
      const colId = s.addCollection(space.id, 'New collection', [], at);
      s.moveCard(item, { spaceId: space.id, colId });
    }
  };

  return (
    <main className="space-view">
      <header className="space-head">
        <span className="space-dot big" style={{ background: space.color }} />
        <InlineEdit className="space-name" value={space.name} onSave={(name) => s.updateSpaceMeta(space.id, { name })} />
        <span className="meta">
          {space.collections.length} Collections
          <span className="sep" />
          {tabCount} tabs
        </span>
        <span className="head-right">
          <SyncChip space={space} onSetup={onSettings} />
          <button className="btn ghost" onClick={onShare} title="Export this space as an HTML file anyone can open">
            <Icon name="share" /> Share
          </button>
          <button className="icon-btn" onClick={onSettings} title="Space settings (sync, sharing)">
            <Icon name="more" />
          </button>
        </span>
      </header>

      <div className="toolbar">
        <span className="hint">Double-click names to rename · drag cards between collections or onto a space</span>
        <button className="btn primary" onClick={() => s.addCollection(space.id, 'New collection')}>
          <Icon name="plus" /> New Collection
        </button>
      </div>

      <SyncErrorBanner space={space} onUpdateToken={onUpdateToken} onSettings={onSettings} />
      <PendingBanner space={space} />
      <MergeNotes space={space} />

      {space.collections.map((col, i) => (
        <CollectionView
          key={col.id}
          space={space}
          col={col}
          index={i}
          onEditCard={(card) => onEditCard({ spaceId: space.id, colId: col.id, card })}
          onAddCard={() => onEditCard({ spaceId: space.id, colId: col.id })}
        />
      ))}

      <div
        className={`new-col-drop${newDrop ? ' over' : ''}`}
        onDragOver={(e) => {
          if (!acceptsDrop(e, ['tab', 'card'])) return;
          e.preventDefault();
          setNewDrop(true);
        }}
        onDragLeave={() => setNewDrop(false)}
        onDrop={onNewDrop}
      >
        {space.collections.length ? 'Drop a tab here to start a new collection' : 'This space is empty. Drag tabs from the right, or press New Collection.'}
      </div>
    </main>
  );
}

function SyncChip({ space, onSetup }: { space: Space; onSetup: () => void }) {
  const s = useStore();
  if (!space.sync) {
    return (
      <button className="sync-chip" title="This space is only on this device. Click to link it to a git repo." onClick={onSetup}>
        <Icon name="git" />
        Not synced
        <span className="chip-sub">set up</span>
      </button>
    );
  }
  const busy = s.syncing[space.id];
  const err = space.sync.lastError;
  const pending = s.pending.some((p) => p.spaceId === space.id);
  const t = space.sync.target;
  const where =
    t.type === 'repo' ? `${s.remotes.find((r) => r.id === t.remoteId)?.label ?? 'git'}${t.follow ? ' · following' : ''}` : 'shared link';
  const label = busy ? 'Syncing…' : err ? 'Sync problem' : pending ? 'Update waiting' : `Synced ${relativeTime(space.sync.lastCheckedAt)}`;
  return (
    <button
      className={`sync-chip${err ? ' err' : pending ? ' warn' : ''}`}
      title={err ?? s.syncMessage[space.id] ?? `Syncs with ${where}. Click to sync now.`}
      onClick={() => void s.syncNow(space.id, true)}
      disabled={busy}
    >
      <Icon name={err ? 'alert' : 'sync'} className={busy ? 'spin' : ''} />
      {label}
      <span className="chip-sub">{where}</span>
    </button>
  );
}

/** Shown when the last sync failed, with the fix close at hand (usually: the token expired). */
function SyncErrorBanner({ space, onUpdateToken, onSettings }: { space: Space; onUpdateToken: (id: string) => void; onSettings: () => void }) {
  const s = useStore();
  const err = space.sync?.lastError;
  if (!err) return null;
  const t = space.sync!.target;
  const tokenProblem = t.type === 'repo' && /token|401|403|sign in|permission|reconnect/i.test(err);
  // Name the exact repo, so a wrong one is obvious right where the problem shows up.
  const remote = t.type === 'repo' ? s.remotes.find((r) => r.id === t.remoteId) : undefined;
  const where = remote
    ? `${remote.kind === 'github' ? 'GitHub' : `${new URL(remote.baseUrl).host} (${KIND_NAMES[remote.kind]})`}`
    : '';
  return (
    <div className="banner error">
      <Icon name="alert" />
      <span className="banner-text">
        {remote ? (
          <>
            Sync problem with{' '}
            <b className="repo-name">
              {remote.owner}/{remote.repo}
            </b>{' '}
            on {where}
            {t.type === 'repo' && <span className="muted"> (file {t.path})</span>}.
          </>
        ) : t.type === 'url' ? (
          <>
            Sync problem with <b className="repo-name">{t.url}</b>.
          </>
        ) : (
          <b>Sync problem.</b>
        )}{' '}
        {err}
      </span>
      {tokenProblem && (
        <button className="btn primary" onClick={() => onUpdateToken(t.remoteId)}>
          Update token
        </button>
      )}
      {space.sync?.badFileSha && !isReadOnly(space) && (
        <button
          className="btn primary"
          disabled={s.syncing[space.id]}
          onClick={() => confirm(`Overwrite the file in the repo with “${space.name}”? Its old content stays in the repo's history.`) && void s.replaceRemoteFile(space.id)}
        >
          Replace it with this space
        </button>
      )}
      <button className="btn" onClick={() => void s.syncNow(space.id, true)} disabled={s.syncing[space.id]}>
        Try again
      </button>
      <button className="btn ghost" onClick={onSettings}>
        Settings
      </button>
    </div>
  );
}

/** After a merge: what clashed and how it was settled. */
function MergeNotes({ space }: { space: Space }) {
  const s = useStore();
  const notes = s.mergeNotes[space.id];
  if (!notes?.length) return null;
  return (
    <div className="banner info">
      <Icon name="check" />
      <span className="banner-text">
        <b>Merged.</b> A few things needed a decision:
        <ul className="merge-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </span>
      <button className="btn ghost" onClick={() => s.dismissMergeNotes(space.id)}>
        OK
      </button>
    </div>
  );
}

function PendingBanner({ space }: { space: Space }) {
  const s = useStore();
  const p = s.pending.find((x) => x.spaceId === space.id);
  if (!p) return null;
  const theirs = p.remote.content.collections.reduce((n, c) => n + c.cards.length, 0);
  const readOnly = isReadOnly(space);
  return (
    <div className={`banner${p.kind === 'conflict' ? ' conflict' : ''}`}>
      <Icon name={p.kind === 'conflict' ? 'alert' : 'download'} />
      <span className="banner-text">
        {p.kind === 'conflict' ? (
          <>
            <b>This space changed here and somewhere else.</b> The other version ({theirs} tabs, {new Date(p.remote.updatedAt).toLocaleString()}) is
            different from yours. <b>Merge both</b> keeps everyone's changes.
          </>
        ) : (
          <>
            <b>Update available</b> from {new Date(p.remote.updatedAt).toLocaleString()} ({p.remote.content.collections.length} collections, {theirs}{' '}
            tabs).
          </>
        )}
      </span>
      {p.kind === 'conflict' && (
        <button className="btn primary" onClick={() => void s.resolve(space.id, 'merge')} title="Combine both: additions, deletions and edits from each side">
          Merge both
        </button>
      )}
      <button className={p.kind === 'conflict' ? 'btn' : 'btn primary'} onClick={() => void s.resolve(space.id, 'take-theirs')}>
        {p.kind === 'conflict' ? 'Use theirs' : 'Pull update'}
      </button>
      {p.kind === 'conflict' && (
        <>
          {!readOnly && (
            <button className="btn" onClick={() => void s.resolve(space.id, 'keep-mine')}>
              Keep mine
            </button>
          )}
          <button className="btn ghost" onClick={() => void s.resolve(space.id, 'keep-both')} title="Your version is saved as a separate space">
            Keep as 2 spaces
          </button>
        </>
      )}
      <button className="btn ghost" onClick={() => void s.resolve(space.id, 'ignore')}>
        Ignore
      </button>
    </div>
  );
}

function SearchResults({ onEditCard }: { onEditCard: (t: CardTarget) => void }) {
  const s = useStore();
  const q = s.query.trim().toLowerCase();
  const hits = s.spaces.flatMap((space) =>
    space.collections.flatMap((col) =>
      col.cards
        .filter((c) => `${c.title} ${c.url} ${c.note ?? ''}`.toLowerCase().includes(q))
        .map((card) => ({ space, col, card })),
    ),
  );
  return (
    <main className="space-view">
      <header className="space-head">
        <span className="space-name">Search</span>
        <span className="meta">
          {hits.length} {hits.length === 1 ? 'result' : 'results'} for “{s.query.trim()}”
        </span>
        <span className="head-right">
          <button className="btn ghost" onClick={() => s.setQuery('')}>
            Clear
          </button>
        </span>
      </header>
      <div className="grid search-grid">
        {hits.map(({ space, col, card }) => (
          <div key={card.id} className="card-slot">
            <CardView
              card={card}
              spaceId={space.id}
              colId={col.id}
              onEdit={() => onEditCard({ spaceId: space.id, colId: col.id, card })}
              onDelete={() => s.deleteCard(space.id, col.id, card.id)}
            />
            <div className="hit-path">
              <span className="space-dot" style={{ background: space.color }} /> {space.name} › {col.name}
            </div>
          </div>
        ))}
      </div>
      {!hits.length && <p className="empty">Nothing matches. Search looks at titles, links and notes in every space.</p>}
    </main>
  );
}
