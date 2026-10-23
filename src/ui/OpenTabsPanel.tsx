import { useCallback, useEffect, useState } from 'react';
import { closeTab, currentWindowTabs, focusTab, onTabsChanged, type OpenTab } from '../browser/tabs';
import { activeSpace, useStore } from '../store/store';
import { endDrag, startDrag } from './dnd';
import { Favicon } from './CardView';
import { Icon } from './icons';

export function OpenTabsPanel({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const s = useStore();
  const space = activeSpace(s);

  const refresh = useCallback(() => void currentWindowTabs().then(setTabs), []);
  useEffect(() => {
    refresh();
    return onTabsChanged(refresh);
  }, [refresh]);

  const saveWindow = () => {
    if (!space || !tabs.length) return;
    const name = `Session ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    s.addCollection(space.id, name, tabs.map((t) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl })));
    s.showToast(`Saved ${tabs.length} tabs to ${space.name}`);
  };

  if (collapsed) {
    return (
      <aside className="open-tabs collapsed">
        <button className="rail-btn" title="Show open tabs  ]" onClick={onToggle}>
          <Icon name="collapseLeft" />
          <Icon name="tabs" />
          <span className="rail-count">{tabs.length}</span>
          <span className="rail-label">Open Tabs</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="open-tabs">
      <div className="panel-head">
        <Icon name="tabs" />
        <span>Open Tabs</span>
        <button className="icon-btn panel-toggle" title="Hide open tabs  ]" onClick={onToggle}>
          <Icon name="collapseRight" />
        </button>
      </div>
      <div className="panel-sub">
        <span>
          This window · {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
        </span>
        <button className="icon-btn" title={`Save all as a collection in ${space?.name ?? 'this space'}`} onClick={saveWindow} disabled={!tabs.length}>
          <Icon name="save" />
        </button>
      </div>
      <p className="panel-hint">Drag a tab into a collection to save it.</p>
      <ul className="tab-list">
        {tabs.map((t) => (
          <li
            key={t.id}
            draggable
            onDragStart={(e) => startDrag(e, { kind: 'tab', title: t.title, url: t.url, favIconUrl: t.favIconUrl }, t.url)}
            onDragEnd={endDrag}
            onClick={() => void focusTab(t.id)}
            title={t.url}
          >
            <Favicon url={t.url} fallback={t.favIconUrl} title={t.title} />
            <span className="tab-title">{t.title}</span>
            <button
              className="icon-btn"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(t.id);
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
