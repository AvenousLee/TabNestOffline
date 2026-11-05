import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '../types';
import { faviconFor } from '../browser/tabs';
import { hostOf } from '../lib/util';
import { endDrag, startDrag } from './dnd';
import { Icon } from './icons';
import { UnlockDialog } from './UnlockDialog';

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

/** Stops a click inside a card from opening its link or editor. */
const stop = (e: React.SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/** The description: shown, folded away until clicked, or locked with a password. */
function CardNote({ card }: { card: Card }) {
  const [show, setShow] = useState(false);
  const [asking, setAsking] = useState(false);
  // A locked description is asked for every time: its text is kept only while it is open.
  const [unlocked, setUnlocked] = useState<string>();
  const text = card.noteLock ? unlocked : card.note;
  const privateNote = !!card.noteLock || !!card.noteHidden;

  if (privateNote && !(show && text)) {
    const locked = !!card.noteLock;
    return (
      <>
        <button
          type="button"
          className="card-note-closed"
          title={locked ? 'Protected with a password' : 'Hidden description'}
          onClick={(e) => {
            stop(e);
            if (locked) setAsking(true);
            else setShow(true);
          }}
        >
          <Icon name={locked ? 'lock' : 'eyeOff'} size={13} /> {locked ? 'Locked description · unlock' : 'Hidden description · show'}
        </button>
        {asking &&
          card.noteLock &&
          createPortal(
            <UnlockDialog
              title={card.title}
              lock={card.noteLock}
              onUnlocked={(t) => {
                setUnlocked(t);
                setAsking(false);
                setShow(true);
              }}
              onClose={() => setAsking(false)}
            />,
            document.body,
          )}
      </>
    );
  }
  if (!text) return null;
  return (
    <div className="card-note" title={privateNote ? undefined : text}>
      {text}
      {privateNote && (
        <button
          type="button"
          className="card-note-hide"
          title={card.noteLock ? 'Lock it again' : 'Hide it again'}
          onClick={(e) => {
            stop(e);
            setShow(false);
            setUnlocked(undefined);
          }}
        >
          <Icon name={card.noteLock ? 'lock' : 'eyeOff'} size={12} />
        </button>
      )}
    </div>
  );
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
  // A card without a link is a note: clicking it opens the editor instead of a page.
  const isNote = !card.url;
  const body = (
    <>
      {card.image && <CardImage src={card.image} />}
      <div className="card-title">
        {isNote ? <Icon name="note" size={16} className="note-icon" /> : <Favicon url={card.url} fallback={card.favIconUrl} title={card.title} />}
        <span>{card.title || card.url || 'Note'}</span>
      </div>
      {/* Starts folded again whenever the privacy setting changes. */}
      <CardNote key={`${card.noteLock ?? ''}|${card.noteHidden ? 'h' : ''}`} card={card} />
      {isNote ? <div className="card-host">Note</div> : <div className="card-host">{hostOf(card.url)}</div>}
      {!readOnly && (
        <div
          className="card-actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button className="icon-btn" title="Edit" onClick={onEdit}>
            <Icon name="edit" size={14} />
          </button>
          <button className="icon-btn" title="Remove" onClick={onDelete}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </>
  );
  const drag = {
    draggable: !readOnly,
    onDragStart: (e: React.DragEvent) => startDrag(e, { kind: 'card', spaceId, colId, cardId: card.id }, card.url || undefined),
    onDragEnd: endDrag,
  };
  if (isNote) {
    return (
      <div className="card note-card" role="button" tabIndex={0} title={readOnly ? undefined : 'Click to edit this note'} onClick={readOnly ? undefined : onEdit} {...drag}>
        {body}
      </div>
    );
  }
  return (
    <a className="card" href={card.url} title={card.url} {...drag}>
      {body}
    </a>
  );
}
