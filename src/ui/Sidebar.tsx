import { useEffect, useRef, useState } from 'react';
import { defaultSpaceId, useStore } from '../store/store';
import { acceptsDrop, draggingKind, endDrag, readDrop, reorderIndex, startDrag } from './dnd';
import { Icon } from './icons';
import { InlineEdit } from './InlineEdit';
import { followsOthers } from '../sync/engine';

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
  /** Space under the pointer while dragging: a line above/below it for a space, an outline for a card or tab. */
  const [over, setOver] = useState<{ id: string; at: 'before' | 'after' | 'into' } | null>(null);

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

  // The space new tabs open on: the one chosen in Settings, else the first.
  const defaultId = defaultSpaceId(s.spaces, s.prefs);
  // Space being renamed from its ⋯ menu (the row turns into a text box).
  const [renaming, setRenaming] = useState<string | null>(null);

  const onDrop = (e: React.DragEvent, spaceId: string, index: number) => {
    e.preventDefault();
    const after = over?.at === 'after';
    setOver(null);
    const item = readDrop(e);
    endDrag();
    if (!item) return;
    if (item.kind === 'space') {
      const from = s.spaces.findIndex((x) => x.id === item.spaceId);
      if (from >= 0 && item.spaceId !== spaceId) s.moveSpace(item.spaceId, reorderIndex(from, index, after));
    }
    if (item.kind === 'card' && item.spaceId !== spaceId) s.moveCard(item, { spaceId });
    if (item.kind === 'collection' && item.spaceId !== spaceId) {
      // A collection dropped on a space moves there; with Ctrl held it is copied.
      const to = s.spaces.find((x) => x.id === spaceId)!;
      const from = s.spaces.find((x) => x.id === item.spaceId);
      if (followsOthers(to)) s.showToast(`${to.name} follows someone else's copy, so collections can't be added to it.`);
      else {
        const mode = e.ctrlKey || (from && followsOthers(from)) ? 'copy' : 'move';
        const name = from?.collections.find((c) => c.id === item.colId)?.name ?? 'Collection';
        s.transferCollections(item.spaceId, [item.colId], spaceId, mode);
        s.showToast(`${mode === 'copy' ? 'Copied' : 'Moved'} “${name}” to ${to.name}.`);
      }
    }
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
      {s.prefs.calendarEnabled !== false && (
        <button className={`space-item cal-entry${s.page === 'calendar' && !s.query ? ' active' : ''}`} onClick={() => s.openCalendar()} title={collapsed ? 'Calendar' : undefined}>
          <span className="cal-entry-icon">
            <Icon name="calendar" size={16} />
            <b>{new Date().getDate()}</b>
          </span>
          <span className="space-label">Calendar</span>
        </button>
      )}

      <div className="side-section">
        <span className="label">Spaces</span>
        <button className="icon-btn" title="Create space" onClick={() => s.addSpace('New space')}>
          <Icon name="plus" size={14} />
        </button>
      </div>

      <nav className="space-list">
        {s.spaces.map((space, i) => {
          const pending = s.pending.some((p) => p.spaceId === space.id);
          const isDefault = space.id === defaultId;
          return (
            <div key={space.id} className="space-row">
              {renaming === space.id && !collapsed ? (
                <div className="space-item renaming">
                  <span className="space-dot" style={{ background: space.color }}>
                    {space.name.charAt(0).toUpperCase()}
                  </span>
                  <InlineEdit
                    className="space-label"
                    value={space.name}
                    editing
                    onEditingChange={(on) => !on && setRenaming(null)}
                    onSave={(name) => s.updateSpaceMeta(space.id, { name })}
                  />
                </div>
              ) : (
                <button
                  className={`space-item${space.id === s.activeSpaceId && s.page === 'space' && !s.query ? ' active' : ''}${over?.id === space.id ? (over.at === 'into' ? ' over' : ` drop-${over.at}`) : ''}`}
                  onClick={() => s.setActive(space.id)}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: 'space', spaceId: space.id })}
                  onDragEnd={endDrag}
                  onDragOver={(e) => {
                    if (!acceptsDrop(e, ['space', 'card', 'tab', 'collection'])) return;
                    e.preventDefault();
                    if (draggingKind() === 'space') {
                      // Upper half: drop above this space; lower half: below it.
                      const r = e.currentTarget.getBoundingClientRect();
                      e.dataTransfer.dropEffect = 'move';
                      setOver({ id: space.id, at: e.clientY < r.top + r.height / 2 ? 'before' : 'after' });
                    } else setOver({ id: space.id, at: 'into' });
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => onDrop(e, space.id, i)}
                  title={collapsed ? space.name : 'Drag to change the order'}
                >
                  <span className="space-dot" style={{ background: space.color }}>
                    {space.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="space-label">{space.name}</span>
                  {isDefault && (
                    <span className="default-mark" title="Default space: opens in new tabs">
                      <Icon name="home" size={12} />
                    </span>
                  )}
                  {space.sync && (
                    <span className={`sync-mark${space.sync.lastError ? ' err' : ''}`} title={space.sync.lastError ?? 'Synced with git'}>
                      <Icon name={space.sync.target.type === 'repo' ? 'git' : 'link'} size={12} />
                    </span>
                  )}
                  {pending && <span className="badge" title="Update waiting" />}
                </button>
              )}
              {!collapsed && renaming !== space.id && <SpaceMenu spaceId={space.id} isDefault={isDefault} onRename={() => setRenaming(space.id)} />}
            </div>
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
        <button className={`side-link${s.page === 'settings' && !s.query ? ' active' : ''}`} title="Settings" onClick={() => s.openSettings()}>
          <Icon name="settings" /> <span className="label">Settings</span>
        </button>
      </div>
    </aside>
  );
}

/** ⋯ next to a space: make it the default space (the one new tabs open on). */
function SpaceMenu({ spaceId, isDefault, onRename }: { spaceId: string; isDefault: boolean; onRename: () => void }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const chosen = s.prefs.startSpaceId === spaceId;
  const setDefault = (id: string | undefined) => {
    s.savePrefs({ ...s.prefs, startSpaceId: id });
    setOpen(false);
    const name = (s.spaces.find((x) => x.id === id) ?? s.spaces[0])?.name;
    s.showToast(`New tabs now open on ${name}.`);
  };
  return (
    <div className={`space-more${open ? ' open' : ''}`} ref={ref}>
      <button className="icon-btn" title="Space options" onClick={() => setOpen(!open)}>
        <Icon name="more" size={14} />
      </button>
      {open && (
        <div className="cal-menu space-menu">
          <button onClick={() => (setOpen(false), onRename())}>
            <Icon name="edit" size={14} /> Rename
          </button>
          {isDefault ? (
            <p className="muted small">
              <Icon name="home" size={12} /> Default space: opens in new tabs
            </p>
          ) : (
            <button onClick={() => setDefault(spaceId)}>
              <Icon name="home" size={14} /> Set as default space
            </button>
          )}
          {chosen && <button onClick={() => setDefault(undefined)}>Use the first space instead</button>}
        </div>
      )}
    </div>
  );
}
