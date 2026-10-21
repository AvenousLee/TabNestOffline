import { useState } from 'react';
import { useCalendar } from '../../calendar/calStore';
import { normalizeIcalUrl } from '../../calendar/ics';
import { requestHostAccess } from '../../browser/tabs';
import { Field, Modal } from '../Modal';

/** Link a calendar by its iCal address (view only). */
export function AddCalendarDialog({ onClose }: { onClose: () => void }) {
  const cal = useCalendar();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  let valid = false;
  try {
    valid = /^https?:$/.test(new URL(normalizeIcalUrl(url)).protocol);
  } catch {
    valid = false;
  }

  // Runs from a click: Chrome asks for access to the calendar's website first.
  const add = async () => {
    if (!valid) return;
    setError('');
    setBusy(true);
    try {
      const origin = new URL(normalizeIcalUrl(url)).origin;
      if (!(await requestHostAccess(origin))) throw new Error(`TabNest needs permission to read ${new URL(origin).host}. Please click Allow.`);
      await cal.addIcal(url, name);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const preview = typeof chrome === 'undefined' || !chrome.runtime?.id;
      setError(preview && /could not reach/i.test(msg) ? `${msg} (The localhost preview is blocked by most calendar servers; the installed extension can reach them.)` : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Link a calendar"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="link-btn" onClick={() => setHelp(!help)}>
            Where do I find the iCal address?
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={() => void add()}>
            {busy ? 'Checking…' : 'Add calendar'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field label="iCal address (.ics)" hint="View only. Events are created and cancelled in Google / Outlook as usual, and appear here within ~15 minutes.">
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
        </Field>
        <Field label="Name (optional)" hint="Default: the calendar's own name, e.g. “SI Team – AL”.">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="AL / Out of office" />
        </Field>
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}

      {help && (
        <div className="cal-help">
          <p>
            <b>Google Calendar:</b> calendar.google.com → ⚙ Settings → under <i>Settings for my calendars</i> click the calendar → <i>Integrate calendar</i> →
            copy <b>Secret address in iCal format</b> (or <i>Public address</i> if the calendar is public).
          </p>
          <p>
            <b>Outlook / Office 365:</b> Outlook on the web → ⚙ Settings → Calendar → <i>Shared calendars</i> → <i>Publish a calendar</i> → choose the
            calendar and <i>Can view all details</i> → Publish → copy the <b>ICS</b> link.
          </p>
          <p>
            <b>Others</b> (Apple, public holidays…): any link ending in <code>.ics</code> or starting with <code>webcal://</code>.
          </p>
          <p className="muted small">A secret address works like a password: anyone with it can see the calendar. TabNest keeps it on this device only (it is not synced to git or put in shared files).</p>
        </div>
      )}
    </Modal>
  );
}
