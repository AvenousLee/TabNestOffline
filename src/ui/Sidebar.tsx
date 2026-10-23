import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { acceptsDrop, endDrag, readDrop, startDrag } from './dnd';
import { Icon } from './icons';

export function Sidebar({
  onRemotes,
  onImport,
  onShareMany,
  collapsed,
  onToggle,
}: {
  onRemotes: () => void;
  onImport: () => void;
  onShareMany: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const s = useStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);

  // "/" focuses search, like Toby.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        if (collapsed) onToggle();
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, onToggle]);

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
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand">
        <img src="icons/icon-32.png" alt="" width={26} height={26} />
        <span className="label">TabNest</span>
        <button className="icon-btn panel-toggle" title={collapsed ? 'Show sidebar  [' : 'Hide sidebar  ['} onClick={onToggle}>
          <Icon name={collapsed ? 'collapseRight' : 'collapseLeft'} />
        </button>
      </div>

      <label
        className="search-box"
        title={collapsed ? 'Search  /' : undefined}
        onClick={() => {
          if (!collapsed) return;
          onToggle();
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      >
        <Icon name="search" />
        <input ref={searchRef} placeholder="Search" value={s.query} onChange={(e) => s.setQuery(e.target.value)} />
        <kbd>/</kbd>
      </label>

      {/* One Calendar page for all linked calendars (spaces stay for tabs). */}
      <button className={`space-item cal-entry${s.page === 'calendar' && !s.query ? ' active' : ''}`} onClick={() => s.openCalendar()} title={collapsed ? 'Calendar' : undefined}>
        <span className="cal-entry-icon">
          <Icon name="calendar" size={16} />
          <b>{new Date().getDate()}</b>
        </span>
        <span className="space-label">Calendar</span>
      </button>

      <div className="side-section">
        <span className="label">Spaces</span>
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
              className={`space-item${space.id === s.activeSpaceId && s.page === 'space' && !s.query ? ' active' : ''}${over === space.id ? ' over' : ''}`}
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
              title={collapsed ? space.name : undefined}
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

      <button className="side-link" title="Create space" onClick={() => s.addSpace('New space')}>
        <Icon name="plus" /> <span className="label">Create Space</span>
      </button>

      <div className="side-bottom">
        <button className="side-link" title="Import shared file" onClick={onImport}>
          <Icon name="upload" /> <span className="label">Import shared file</span>
        </button>
        <button className="side-link" title="Share several spaces" onClick={onShareMany}>
          <Icon name="share" /> <span className="label">Share several spaces</span>
        </button>
        <button className="side-link" title="Git repositories" onClick={onRemotes}>
          <Icon name="git" /> <span className="label">Git repositories</span>
          {s.remotes.length > 0 && <span className="count">{s.remotes.length}</span>}
        </button>
      </div>
    </aside>
  );
}
