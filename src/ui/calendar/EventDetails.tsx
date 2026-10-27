import { useState } from 'react';
import type { CalendarSource, CalEvent } from '../../calendar/types';
import { useCalendar } from '../../calendar/calStore';
import { describeTime, fmt } from '../../calendar/dates';
import { Modal } from '../Modal';
import { Icon } from '../icons';

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/g;

/** Description text with web addresses turned into links (e.g. Teams / Meet links). */
function Linkified({ text }: { text: string }) {
  const parts: Array<string | { href: string }> = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    parts.push(text.slice(last, m.index), { href: m[0] });
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <p className="cal-desc">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a key={i} href={p.href} target="_blank" rel="noreferrer">
            {p.href}
          </a>
        ),
      )}
    </p>
  );
}

export function EventDetails({ event, source, onEdit, onClose }: { event: CalEvent; source?: CalendarSource; onEdit: () => void; onClose: () => void }) {
  const cal = useCalendar();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const google = source?.kind === 'google';
  const editable = google && !!source.canEdit && !!event.editable;

  const remove = async () => {
    if (!confirm(event.recurring ? `Delete this occurrence of “${event.title}”? Other dates of the repeating event stay.` : `Delete “${event.title}” from ${source?.name}?`)) return;
    setError('');
    setBusy(true);
    try {
      await cal.deleteEvent(event);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={event.title}
      onClose={onClose}
      footer={
        editable ? (
          <>
            <button className="btn danger" disabled={busy} onClick={() => void remove()}>
              <Icon name="trash" /> {busy ? 'Deleting…' : 'Delete'}
            </button>
            <span className="grow" />
            <button className="btn primary" disabled={busy} onClick={onEdit}>
              <Icon name="edit" /> Edit
            </button>
          </>
        ) : undefined
      }
    >
      <div className="cal-details">
        <div>
          <Icon name="clock" /> <span>{fmt.dayLong(event.start)}</span>
          <span className="muted"> · {describeTime(event)}</span>
        </div>
        {source && (
          <div>
            <span className="cal-swatch" style={{ background: source.color }} /> <span>{source.name}</span>
            {!editable && <span className="muted small"> · view only</span>}
          </div>
        )}
        {event.location && (
          <div>
            <Icon name="pin" /> <span>{event.location}</span>
          </div>
        )}
        {event.url && (
          <div>
            <Icon name="link" />{' '}
            <a href={event.url} target="_blank" rel="noreferrer">
              {event.url}
            </a>
          </div>
        )}
        {event.description && <Linkified text={event.description} />}
        {event.htmlLink && (
          <a className="small" href={event.htmlLink} target="_blank" rel="noreferrer">
            Open in Google Calendar
          </a>
        )}
        {editable && event.recurring && <p className="muted small">This event repeats: Edit and Delete change this occurrence only.</p>}
        {!editable && (
          <p className="muted small">
            {google && source?.canEdit
              ? 'This is an invitation from someone else: only its organiser can change it.'
              : 'To change or cancel this event, open it in Google Calendar or Outlook (only its organiser can).'}
          </p>
        )}
        {error && <div className="status-line err">{error}</div>}
      </div>
    </Modal>
  );
}
