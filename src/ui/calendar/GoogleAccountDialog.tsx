import { useState } from 'react';
import { useCalendar } from '../../calendar/calStore';
import { canUseGoogle, type GoogleCalendarEntry } from '../../calendar/google';
import { GoogleSetupSteps, GoogleWhy } from './GoogleSetupGuide';
import { Field, Modal } from '../Modal';

/** Sign in to a Google account (one more each time), after a one-time Google Cloud setup. */
export function GoogleAccountDialog({ onSignedIn, onClose }: { onSignedIn: (email: string, calendars: GoogleCalendarEntry[]) => void; onClose: () => void }) {
  const cal = useCalendar();
  const [clientId, setClientId] = useState(cal.clientId);
  const [help, setHelp] = useState(!cal.clientId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /\.apps\.googleusercontent\.com$/.test(clientId.trim());

  const signIn = async () => {
    if (!valid) return;
    setError('');
    setBusy(true);
    try {
      if (clientId.trim() !== cal.clientId) cal.setClientId(clientId);
      const { account, calendars } = await useCalendar.getState().addGoogleAccount();
      onSignedIn(account.email, calendars); // next: choose which calendars to show
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add a Google account"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="link-btn" onClick={() => setHelp(!help)}>
            {help ? 'Hide setup steps' : 'How do I get a client ID?'}
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid || busy || !canUseGoogle()} onClick={() => void signIn()}>
            {busy ? 'Waiting for Google…' : 'Sign in with Google'}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        Your own Google calendars, where you can add, change and delete events. Add each account you use (work and personal) one after the other; Google lets you pick which
        account each time.
      </p>
      {!canUseGoogle() && <div className="status-line warn">Google sign-in works in the installed TabNest extension, not in this preview.</div>}
      <Field label="Google client ID" hint="Made once in Google Cloud (see the steps). The same ID works for all your accounts.">
        <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc….apps.googleusercontent.com" spellCheck={false} />
      </Field>
      {error && <div className="status-line err">{error}</div>}

      {help && (
        <>
          <GoogleWhy />
          <GoogleSetupSteps last="Create, then copy the Client ID into the box above." />
        </>
      )}
    </Modal>
  );
}
