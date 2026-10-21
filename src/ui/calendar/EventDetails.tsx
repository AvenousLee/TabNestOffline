import type { CalendarSource, CalEvent } from '../../calendar/types';
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

export function EventDetails({ event, source, onClose }: { event: CalEvent; source?: CalendarSource; onClose: () => void }) {
  return (
    <Modal title={event.title} onClose={onClose}>
      <div className="cal-details">
        <div>
          <Icon name="clock" /> <span>{fmt.dayLong(event.start)}</span>
          <span className="muted"> · {describeTime(event)}</span>
        </div>
        {source && (
          <div>
            <span className="cal-swatch" style={{ background: source.color }} /> <span>{source.name}</span>
            <span className="muted small"> · view only</span>
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
        <p className="muted small">To change or cancel this event, open it in Google Calendar or Outlook (only its organiser can).</p>
      </div>
    </Modal>
  );
}
