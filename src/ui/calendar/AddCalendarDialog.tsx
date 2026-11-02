import { useState } from 'react';
import { useCalendar } from '../../calendar/calStore';
import { normalizeIcalUrl } from '../../calendar/ics';
import { usernameFromUrl } from '../../calendar/caldav';
import { requestHostAccess } from '../../browser/tabs';
import { Field, Modal } from '../Modal';

const httpOrigin = (raw: string): string | null => {
  try {
    const u = new URL(raw.trim());
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
};

/** Link a calendar by its iCal address, or a webmail calendar (CalDAV) with its login. View only. */
export function AddCalendarDialog({ onClose }: { onClose: () => void }) {
  const cal = useCalendar();
  const [kind, setKind] = useState<'ical' | 'caldav'>('ical');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const origin = httpOrigin(kind === 'ical' ? normalizeIcalUrl(url) : url);
  const valid = !!origin && (kind === 'ical' || (!!username.trim() && !!password));

  // Runs from a click: Chrome asks for access to the calendar's website first.
  const add = async () => {
    if (!valid || !origin) return;
    setError('');
    setBusy(true);
    try {
      if (!(await requestHostAccess(origin))) throw new Error(`TabNest needs permission to read ${new URL(origin).host}. Please click Allow.`);
      if (kind === 'ical') await cal.addIcal(url, name);
      else await cal.addCaldav({ url, username, password }, name);
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
            {kind === 'ical' ? 'Where do I find the iCal address?' : 'Where do I find the webmail address?'}
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
      <div className="seg">
        <button className={kind === 'ical' ? 'on' : ''} onClick={() => (setKind('ical'), setError(''))}>
          iCal link
        </button>
        <button className={kind === 'caldav' ? 'on' : ''} onClick={() => (setKind('caldav'), setError(''))}>
          Webmail calendar
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        {kind === 'ical' ? (
          <Field label="iCal address (.ics)" hint="View only. Events are created and cancelled in Google / Outlook as usual, and appear here within ~15 minutes.">
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
          </Field>
        ) : (
          <>
            <Field label="Calendar address (CalDAV)" hint="View only. Add and change events in webmail as usual; they appear here within ~15 minutes.">
              <input
                autoFocus
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!username) setUsername(usernameFromUrl(e.target.value));
                }}
                placeholder="https://mail.example.com:2080/calendars/name@example.com/calendar"
                spellCheck={false}
              />
            </Field>
            <div className="row">
              <Field label="Username" hint="Usually your full email address.">
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" spellCheck={false} />
              </Field>
              <Field label="Password" hint="Your email password. Kept on this device only.">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </Field>
            </div>
          </>
        )}
        <Field label="Name (optional)" hint={kind === 'ical' ? 'Default: the calendar\'s own name, e.g. “SI Team – AL”.' : 'Default: “Webmail – ” and the username.'}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'ical' ? 'AL / Out of office' : 'Work calendar'} />
        </Field>
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}

      {help && kind === 'ical' && (
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
      {help && kind === 'caldav' && (
        <div className="cal-help">
          <p>
            <b>cPanel webmail</b> (e.g. mail.yourcompany.com): the address is <code>https://mail.yourcompany.com:2080/calendars/you@yourcompany.com/calendar</code>.
            If yours differs, look for the <i>Calendar and Contacts</i> configuration page in webmail or cPanel: it lists the exact address. Username = your full
            email address, password = your email password.
          </p>
          <p>
            <b>Nextcloud, Fastmail, iCloud and other CalDAV servers</b> work the same way: paste the calendar's CalDAV address and your login (for iCloud and Fastmail use an
            app-specific password).
          </p>
          <p className="muted small">The password is kept on this device only, like Git tokens: it is not synced to git, put in shared files, or added to backups unless you include secrets.</p>
        </div>
      )}
    </Modal>
  );
}
