import { useState } from 'react';
import { useCalendar } from '../../calendar/calStore';
import { canUseGoogle, redirectUri } from '../../calendar/google';
import { Field, Modal } from '../Modal';

/** Sign in to a Google account (one more each time), after a one-time Google Cloud setup. */
export function GoogleAccountDialog({ onClose }: { onClose: () => void }) {
  const cal = useCalendar();
  const [clientId, setClientId] = useState(cal.clientId);
  const [help, setHelp] = useState(!cal.clientId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const redirect = redirectUri();
  const valid = /\.apps\.googleusercontent\.com$/.test(clientId.trim());

  const signIn = async () => {
    if (!valid) return;
    setError('');
    setBusy(true);
    try {
      if (clientId.trim() !== cal.clientId) cal.setClientId(clientId);
      await useCalendar.getState().addGoogleAccount();
      onClose(); // the Calendar page downloads the new calendars' events for the shown dates
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
        <div className="cal-help">
          <p>One-time setup in Google Cloud (free), with any Google account:</p>
          <ol>
            <li>
              Open{' '}
              <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                console.cloud.google.com
              </a>{' '}
              and create a project, e.g. “TabNest”.
            </li>
            <li>
              <i>APIs &amp; Services → Library</i>: search <b>Google Calendar API</b> and click <b>Enable</b>.
            </li>
            <li>
              <i>Google Auth Platform → Branding</i> (or <i>OAuth consent screen</i>): app name “TabNest”, your email. Audience: <b>External</b>, leave it in <b>Testing</b> and add
              every Google account you will sign in with under <b>Test users</b>.
            </li>
            <li>
              <i>Clients → Create client</i>: type <b>Web application</b>. Under <b>Authorised redirect URIs</b> add:
              <br />
              <code className="cal-redirect">{redirect || 'https://<extension id>.chromiumapp.org/ (shown in the installed extension)'}</code>{' '}
              {redirect && (
                <button
                  className="link-btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(redirect);
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </li>
            <li>Create, then copy the <b>Client ID</b> into the box above.</li>
          </ol>
          <p className="muted small">
            The redirect address belongs to this copy of TabNest. A copy loaded from another folder (or from a store) has a different one: add that too. Company Google Workspace
            accounts may need the IT admin to allow the app.
          </p>
        </div>
      )}
    </Modal>
  );
}
