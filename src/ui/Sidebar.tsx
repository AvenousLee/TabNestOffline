import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { acceptsDrop, endDrag, readDrop, startDrag } from './dnd';
import { Icon } from './icons';

export function Sidebar({ onRemotes, onImport, onShareMany }: { onRemotes: () => void; onImport: () => void; onShareMany: () => void }) {
  const s = useStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);

  // "/" focuses search, like Toby.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDrop = (e: React.DragEvent, spaceId: string, index: number) => {
    e.preventDefault();
    setOver(null);
    const item = readDrop(e);
    endDrag();
    if (!item) return;
    if (item.kind === 'space') s.moveSpace(item.spaceId, index);
    if (item.kind === 'card' && item.spaceId !== spaceId) s.moveCard(item, { spaceId });
    if (item.kind === 'tab') {
      const space = s.spaces.find((x) => x.id === spaceId)!;
      const colId = space.collections[0]?.id ?? s.addCollection(spaceId, 'Inbox');
      s.addCard(spaceId, colId, { title: item.title, url: item.url, favIconUrl: item.favIconUrl });
      s.showToast(`Saved to ${space.name}`);
    }
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="icons/icon-32.png" alt="" width={26} height={26} />
        <span>TabNest</span>
      </div>

      <label className="search-box">
        <Icon name="search" />
        <input ref={searchRef} placeholder="Search" value={s.query} onChange={(e) => s.setQuery(e.target.value)} />
        <kbd>/</kbd>
      </label>

      <div className="side-section">
        <span>Spaces</span>
        <button className="icon-btn" title="Create space" onClick={() => s.addSpace('New space')}>
          <Icon name="plus" size={14} />
        </button>
      </div>

      <nav className="space-list">
        {s.spaces.map((space, i) => {
          const pending = s.pending.some((p) => p.spaceId === space.id);
          return (
            <button
              key={space.id}
              className={`space-item${space.id === s.activeSpaceId && !s.query ? ' active' : ''}${over === space.id ? ' over' : ''}`}
              onClick={() => s.setActive(space.id)}
              draggable
              onDragStart={(e) => startDrag(e, { kind: 'space', spaceId: space.id })}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (!acceptsDrop(e, ['space', 'card', 'tab'])) return;
                e.preventDefault();
                setOver(space.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(e, space.id, i)}
            >
              <span className="space-dot" style={{ background: space.color }}>
                {space.name.charAt(0).toUpperCase()}
              </span>
              <span className="space-label">{space.name}</span>
              {space.sync && (
                <span className={`sync-mark${space.sync.lastError ? ' err' : ''}`} title={space.sync.lastError ?? 'Synced with git'}>
                  <Icon name={space.sync.target.type === 'repo' ? 'git' : 'link'} size={12} />
                </span>
              )}
              {pending && <span className="badge" title="Update waiting" />}
            </button>
          );
        })}
      </nav>

      <button className="side-link" onClick={() => s.addSpace('New space')}>
        <Icon name="plus" /> Create Space
      </button>

      <div className="side-bottom">
        <button className="side-link" onClick={onImport}>
          <Icon name="upload" /> Import (shared file / Toby)
        </button>
        <button className="side-link" onClick={onShareMany}>
          <Icon name="share" /> Share several spaces
        </button>
        <button className="side-link" onClick={onRemotes}>
          <Icon name="git" /> Git repositories
          {s.remotes.length > 0 && <span className="count">{s.remotes.length}</span>}
        </button>
      </div>
    </aside>
  );
}
