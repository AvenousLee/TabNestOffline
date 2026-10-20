import { useState } from 'react';
import type { Card } from '../types';
import { faviconFor } from '../browser/tabs';
import { hostOf } from '../lib/util';
import { endDrag, startDrag } from './dnd';
import { Icon } from './icons';

export function Favicon({ url, fallback, title }: { url: string; fallback?: string; title: string }) {
  const [broken, setBroken] = useState(false);
  const src = faviconFor(url, fallback);
  if (!src || broken) return <span className="favicon letter">{(title || hostOf(url)).charAt(0).toUpperCase()}</span>;
  return <img className="favicon" src={src} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
}

/** Card picture; hides itself if a linked image can't be loaded. */
function CardImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img className="card-image" src={src} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

export function CardView({
  card,
  spaceId,
  colId,
  onEdit,
  onDelete,
  readOnly,
}: {
  card: Card;
  spaceId: string;
  colId: string;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  return (
    <a
      className="card"
      href={card.url}
      title={card.url}
      draggable={!readOnly}
      onDragStart={(e) => startDrag(e, { kind: 'card', spaceId, colId, cardId: card.id }, card.url)}
      onDragEnd={endDrag}
    >
      {card.image && <CardImage src={card.image} />}
      <div className="card-title">
        <Favicon url={card.url} fallback={card.favIconUrl} title={card.title} />
        <span>{card.title || card.url}</span>
      </div>
      {card.note && (
        <div className="card-note" title={card.note}>
          {card.note}
        </div>
      )}
      <div className="card-host">{hostOf(card.url)}</div>
      {!readOnly && (
        <div className="card-actions" onClick={(e) => e.preventDefault()}>
          <button className="icon-btn" title="Edit" onClick={onEdit}>
            <Icon name="edit" size={14} />
          </button>
          <button className="icon-btn" title="Remove" onClick={onDelete}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </a>
  );
}
