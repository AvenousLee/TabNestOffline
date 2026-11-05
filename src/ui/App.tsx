import { lazy, Suspense, useEffect, useState, useRef } from 'react';
import { activeSpace, useStore } from '../store/store';
import { Sidebar } from './Sidebar';
import { SpaceView, type CardTarget } from './SpaceView';
import { OpenTabsPanel } from './OpenTabsPanel';
import { CardDialog } from './dialogs/CardDialog';
import { SpaceSettingsDialog } from './dialogs/SpaceSettingsDialog';
import { RemotesDialog } from './dialogs/RemotesDialog';
import { ShareDialog } from './dialogs/ShareDialog';
import { ImportDialog } from './dialogs/ImportDialog';
import { CopyCollectionsDialog } from './dialogs/CopyCollectionsDialog';

// Calendar code (incl. the iCal reader) loads only when the Calendar page is opened.
const CalendarPage = lazy(() => import('./calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((m) => ({ default: m.SettingsPage })));

type Dialog =
  | { type: 'card'; target: CardTarget }
  | { type: 'settings'; spaceId: string }
  | { type: 'remotes'; editId?: string; tokenOnly?: boolean }
  | { type: 'share'; ids: string[] }
  | { type: 'import' }
  | { type: 'copyCols'; spaceId: string; colIds: string[] }
  | null;

export function App() {
  const s = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const space = activeSpace(s);
  const close = () => setDialog(null);

  useEffect(() => {
    void s.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = s.page === 'calendar' && s.prefs.calendarEnabled !== false ? 'Calendar · TabNest' : s.page === 'settings' ? 'Settings · TabNest' : space ? `${space.name} · TabNest` : 'TabNest';
  }, [space, s.page]);

  // Narrow windows show a slim icon strip; the full sidebar slides in over the page when opened.
  const narrow = useNarrow();
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [s.activeSpaceId, s.page, narrow]);

  const leftCollapsed = narrow ? !drawer : !!s.prefs.leftCollapsed;
  const rightCollapsed = !!s.prefs.rightCollapsed;
  const toggleLeft = () =>
    narrowRef.current ? setDrawer((d) => !d) : s.savePrefs({ ...useStore.getState().prefs, leftCollapsed: !useStore.getState().prefs.leftCollapsed });
  const toggleRight = () => s.savePrefs({ ...useStore.getState().prefs, rightCollapsed: !useStore.getState().prefs.rightCollapsed });

  // "[" and "]" show/hide the side panels (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === '[') toggleLeft();
      if (e.key === ']') toggleRight();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s.ready) return null;
  const settingsSpace = dialog?.type === 'settings' ? s.spaces.find((x) => x.id === dialog.spaceId) : undefined;

  return (
    <div className={`app${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}`}>
      {narrow && drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
      <Sidebar
        onRemotes={() => setDialog({ type: 'remotes' })}
        onImport={() => setDialog({ type: 'import' })}
        onShareMany={() => setDialog({ type: 'share', ids: space ? [space.id] : [] })}
        collapsed={leftCollapsed}
        onToggle={toggleLeft}
      />
      <div className="content">
        {s.page === 'calendar' && s.prefs.calendarEnabled !== false && !s.query.trim() ? (
          <Suspense fallback={<main className="space-view"><p className="empty">Loading calendar…</p></main>}>
            <CalendarPage />
          </Suspense>
        ) : s.page === 'settings' && !s.query.trim() ? (
          <Suspense fallback={<main className="space-view"><p className="empty">Loading settings…</p></main>}>
            <SettingsPage onRemotes={() => setDialog({ type: 'remotes' })} />
          </Suspense>
        ) : space ? (
          <SpaceView
            space={space}
            onEditCard={(target) => setDialog({ type: 'card', target })}
            onSettings={() => setDialog({ type: 'settings', spaceId: space.id })}
            onShare={() => setDialog({ type: 'share', ids: [space.id] })}
            onUpdateToken={(remoteId) => setDialog({ type: 'remotes', editId: remoteId, tokenOnly: true })}
            onCopyCollections={(colIds) => setDialog({ type: 'copyCols', spaceId: space.id, colIds })}
          />
        ) : (
          <main className="space-view">
            <p className="empty">No spaces yet. Create one in the sidebar.</p>
          </main>
        )}
      </div>
      <OpenTabsPanel collapsed={rightCollapsed} onToggle={toggleRight} />

      {dialog?.type === 'card' && <CardDialog target={dialog.target} onClose={close} />}
      {settingsSpace && <SpaceSettingsDialog space={settingsSpace} onClose={close} />}
      {dialog?.type === 'remotes' && <RemotesDialog onClose={close} editId={dialog.editId} tokenOnly={dialog.tokenOnly} />}
      {dialog?.type === 'share' && <ShareDialog initial={dialog.ids} onClose={close} />}
      {dialog?.type === 'import' && <ImportDialog onClose={close} />}
      {dialog?.type === 'copyCols' && <CopyCollectionsDialog spaceId={dialog.spaceId} initial={dialog.colIds} onClose={close} />}
      {s.toast && <div className="toast">{s.toast}</div>}
    </div>
  );
}

const NARROW = '(max-width: 640px)';

/** True while the window is narrow (phone-sized or a small side-by-side window). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
