import { useEffect, useState } from 'react';
import { activeSpace, useStore } from '../store/store';
import { Sidebar } from './Sidebar';
import { SpaceView, type CardTarget } from './SpaceView';
import { OpenTabsPanel } from './OpenTabsPanel';
import { CardDialog } from './dialogs/CardDialog';
import { SpaceSettingsDialog } from './dialogs/SpaceSettingsDialog';
import { RemotesDialog } from './dialogs/RemotesDialog';
import { ShareDialog } from './dialogs/ShareDialog';
import { ImportDialog } from './dialogs/ImportDialog';

type Dialog =
  | { type: 'card'; target: CardTarget }
  | { type: 'settings'; spaceId: string }
  | { type: 'remotes'; editId?: string; tokenOnly?: boolean }
  | { type: 'share'; ids: string[] }
  | { type: 'import' }
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
    document.title = space ? `${space.name} · TabNest` : 'TabNest';
  }, [space]);

  if (!s.ready) return null;
  const settingsSpace = dialog?.type === 'settings' ? s.spaces.find((x) => x.id === dialog.spaceId) : undefined;

  return (
    <div className="app">
      <Sidebar
        onRemotes={() => setDialog({ type: 'remotes' })}
        onImport={() => setDialog({ type: 'import' })}
        onShareMany={() => setDialog({ type: 'share', ids: space ? [space.id] : [] })}
      />
      <div className="content">
        {space ? (
          <SpaceView
            space={space}
            onEditCard={(target) => setDialog({ type: 'card', target })}
            onSettings={() => setDialog({ type: 'settings', spaceId: space.id })}
            onShare={() => setDialog({ type: 'share', ids: [space.id] })}
            onUpdateToken={(remoteId) => setDialog({ type: 'remotes', editId: remoteId, tokenOnly: true })}
          />
        ) : (
          <main className="space-view">
            <p className="empty">No spaces yet. Create one in the sidebar.</p>
          </main>
        )}
      </div>
      <OpenTabsPanel />

      {dialog?.type === 'card' && <CardDialog target={dialog.target} onClose={close} />}
      {settingsSpace && <SpaceSettingsDialog space={settingsSpace} onClose={close} />}
      {dialog?.type === 'remotes' && <RemotesDialog onClose={close} editId={dialog.editId} tokenOnly={dialog.tokenOnly} />}
      {dialog?.type === 'share' && <ShareDialog initial={dialog.ids} onClose={close} />}
      {dialog?.type === 'import' && <ImportDialog onClose={close} />}
      {s.toast && <div className="toast">{s.toast}</div>}
    </div>
  );
}
