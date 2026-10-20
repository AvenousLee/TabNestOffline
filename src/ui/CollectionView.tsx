import { useRef, useState } from 'react';
import type { Card, Collection, Space } from '../types';
import { useStore } from '../store/store';
import { openMany } from '../browser/tabs';
import { acceptsDrop, dropIndex, endDrag, readDrop, startDrag } from './dnd';
import { CardView } from './CardView';
import { InlineEdit } from './InlineEdit';
import { Icon } from './icons';

export function CollectionView({
  space,
  col,
  index,
  onEditCard,
  onAddCard,
}: {
  space: Space;
  col: Collection;
  index: number;
  onEditCard: (card: Card) => void;
  onAddCard: () => void;
}) {
  const s = useStore();
  const gridRef = useRef<HTMLDivElement>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [colDrop, setColDrop] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const onDragOver = (e: React.DragEvent) => {
    if (!acceptsDrop(e, ['card', 'tab'])) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copyMove' ? 'move' : 'copy';
    if (gridRef.current) setDropAt(dropIndex(e, gridRef.current, '.card'));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const item = readDrop(e);
    const at = gridRef.current ? dropIndex(e, gridRef.current, '.card') : undefined;
    setDropAt(null);
    endDrag();
    if (!item) return;
    if (item.kind === 'tab') s.addCard(space.id, col.id, { title: item.title, url: item.url, favIconUrl: item.favIconUrl }, at);
    if (item.kind === 'card') s.moveCard(item, { spaceId: space.id, colId: col.id, index: at });
  };

  // Dropping a collection on this header moves it above this one.
  const onHeaderDragOver = (e: React.DragEvent) => {
    if (!acceptsDrop(e, ['collection'])) return;
    e.preventDefault();
    setColDrop(true);
  };
  const onHeaderDrop = (e: React.DragEvent) => {
    const item = readDrop(e);
    setColDrop(false);
    endDrag();
    if (item?.kind === 'collection' && item.spaceId === space.id) {
      e.preventDefault();
      s.moveCollection(space.id, item.colId, index);
    }
  };

  const urls = col.cards.map((c) => c.url);

  return (
    <section
      className={`collection${colDrop ? ' col-drop' : ''}`}
      onDragOver={onHeaderDragOver}
      onDragLeave={() => setColDrop(false)}
      onDrop={onHeaderDrop}
    >
      <div className="col-head">
        <span
          className="drag-handle"
          draggable
          title="Drag to reorder"
          onDragStart={(e) => startDrag(e, { kind: 'collection', spaceId: space.id, colId: col.id })}
          onDragEnd={endDrag}
        >
          ⋮⋮
        </span>
        <InlineEdit
          className="col-name"
          value={col.name}
          editing={editingName}
          onEditingChange={setEditingName}
          onSave={(name) => s.renameCollection(space.id, col.id, name)}
        />
        <button className="icon-btn" title={col.collapsed ? 'Expand' : 'Collapse'} onClick={() => s.toggleCollapsed(space.id, col.id)}>
          <Icon name="chevron" className={col.collapsed ? 'rot-90' : ''} />
        </button>
        <span className="col-actions">
          <button className="icon-btn" title="Open all in tabs" disabled={!urls.length} onClick={() => void openMany(urls, false)}>
            <Icon name="open" />
          </button>
          <button className="icon-btn" title="Open all in a new window" disabled={!urls.length} onClick={() => void openMany(urls, true)}>
            <Icon name="window" />
          </button>
          <button className="icon-btn" title="Rename" onClick={() => setEditingName(true)}>
            <Icon name="edit" />
          </button>
          <button
            className="icon-btn"
            title="Delete collection"
            onClick={() => (col.cards.length === 0 || confirm(`Delete “${col.name}” and its ${col.cards.length} links?`)) && s.deleteCollection(space.id, col.id)}
          >
            <Icon name="trash" />
          </button>
        </span>
      </div>
      <div className="col-count">
        {col.cards.length} {col.cards.length === 1 ? 'tab' : 'tabs'}
      </div>
      {!col.collapsed && (
        <div ref={gridRef} className="grid" onDragOver={onDragOver} onDragLeave={() => setDropAt(null)} onDrop={onDrop}>
          {col.cards.map((card, i) => (
            <div key={card.id} className={`card-slot${dropAt === i ? ' drop-before' : ''}`}>
              <CardView
                card={card}
                spaceId={space.id}
                colId={col.id}
                onEdit={() => onEditCard(card)}
                onDelete={() => s.deleteCard(space.id, col.id, card.id)}
              />
            </div>
          ))}
          <button className={`add-card${dropAt === col.cards.length ? ' drop-before' : ''}`} onClick={onAddCard}>
            {col.cards.length ? <Icon name="plus" /> : 'Drag tabs here or click to add a link'}
          </button>
        </div>
      )}
    </section>
  );
}
