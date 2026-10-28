import { useState } from 'react';
import type { CalendarSource } from '../../calendar/types';
import { CAL_COLORS, useCalendar } from '../../calendar/calStore';
import { normalizeIcalUrl } from '../../calendar/ics';
import { requestHostAccess } from '../../browser/tabs';
import { Field, Modal } from '../Modal';
import { Icon } from '../icons';

/** Change a calendar's name, colour and (for iCal links) address, or delete the link. */
export function EditCalendarDialog({ source, onClose }: { source: CalendarSource; onClose: () => void }) {
  const cal = useCalendar();
  const [name, setName] = useState(source.name);
  const [color, setColor] = useState(source.color);
  const [url, setUrl] = useState(source.url);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isIcal = source.kind !== 'google';
  const colors = CAL_COLORS.includes(source.color) ? CAL_COLORS : [source.color, ...CAL_COLORS];

  let validUrl = !isIcal;
  try {
    validUrl ||= /^https?:$/.test(new URL(normalizeIcalUrl(url)).protocol);
  } catch {
    validUrl = false;
  }

  // Runs from a click: a new address on another website needs Chrome's permission first.
  const save = async () => {
    if (!validUrl || !name.trim()) return;
    setError('');
    setBusy(true);
    try {
      if (isIcal && normalizeIcalUrl(url) !== source.url) {
        const origin = new URL(normalizeIcalUrl(url)).origin;
        if (!(await requestHostAccess(origin))) throw new Error(`TabNest needs permission to read ${new URL(origin).host}. Please click Allow.`);
        await cal.changeIcalUrl(source.id, url);
      }
      cal.updateSource(source.id, { name: name.trim(), color });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!confirm(isIcal ? `Delete “${source.name}” from TabNest? (The calendar itself is not deleted in Google/Outlook.)` : `Remove “${source.name}” from TabNest? It stays in Google; add it back with “Choose calendars…”.`)) return;
    cal.removeSource(source.id);
    onClose();
  };

  return (
    <Modal
      title="Edit calendar"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" /> {isIcal ? 'Delete' : 'Remove from TabNest'}
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!validUrl || !name.trim() || busy} onClick={() => void save()}>
            {busy ? 'Checking…' : 'Save'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name" hint={isIcal ? 'Only changes the name shown in TabNest.' : `From ${source.account}. Only changes the name shown in TabNest.`}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {isIcal && (
          <Field label="iCal address (.ics)" hint="Paste a new address, e.g. after the secret address was reset. It is checked before it is saved.">
            <input value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
          </Field>
        )}
        <Field label="Colour">
          <div className="swatches">
            {colors.map((c) => (
              <button type="button" key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
