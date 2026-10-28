import { useEffect, useState } from 'react';
import { useCalendar } from '../../calendar/calStore';
import type { GoogleCalendarEntry } from '../../calendar/google';
import { Modal } from '../Modal';

const order = (c: GoogleCalendarEntry) => (c.primary ? 0 : c.accessRole === 'owner' ? 1 : c.accessRole === 'writer' ? 2 : 3);

/** Tick which calendars of a Google account TabNest shows. */
export function ChooseCalendarsDialog({ email, calendars: given, onClose }: { email: string; calendars?: GoogleCalendarEntry[]; onClose: () => void }) {
  const cal = useCalendar();
  const [calendars, setCalendars] = useState<GoogleCalendarEntry[] | null>(given ?? null);
  const [error, setError] = useState('');
  const shown = cal.sources.filter((s) => s.account === email).map((s) => s.calendarId!);
  // A newly added account starts with just its main calendar ticked.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(shown.length ? shown : (given ?? []).filter((c) => c.primary).map((c) => c.id)));

  useEffect(() => {
    if (given) return;
    cal
      .accountCalendars(email)
      .then((list) => {
        setCalendars(list);
        if (!shown.length) setChosen(new Set(list.filter((c) => c.primary).map((c) => c.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const toggle = (id: string) =>
    setChosen((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (!calendars) return;
    cal.setAccountCalendars(email, calendars, [...chosen]);
    onClose();
  };

  const list = [...(calendars ?? [])].sort((a, b) => order(a) - order(b) || a.summary.localeCompare(b.summary));

  return (
    <Modal
      title="Choose calendars"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">{chosen.size} chosen</span>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!calendars} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        Calendars of <b>{email}</b> to show in TabNest. You can change this later from the account's ⋯ menu. Nothing changes in Google.
      </p>
      {error && <div className="status-line err">{error}</div>}
      {!calendars && !error && <p className="muted">Loading calendars…</p>}
      <div className="cal-choose">
        {list.map((c) => (
          <label key={c.id} className="check cal-choose-row">
            <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="cal-swatch" style={{ background: c.backgroundColor ?? '#888' }} />
            <span className="cal-choose-name">{c.summaryOverride || (c.primary ? `Main calendar (${c.summary})` : c.summary)}</span>
            <span className="muted small">{c.accessRole === 'owner' || c.accessRole === 'writer' ? 'can edit' : 'view only'}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
