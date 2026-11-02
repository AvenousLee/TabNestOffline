import { useState } from 'react';
import { redirectUri } from '../../calendar/google';
import { ABOUT } from '../../about';
import { Modal } from '../Modal';

/** The same steps, online (for reading on another screen or sharing with a colleague). */
export const GOOGLE_GUIDE_URL = `${ABOUT.repoUrl}/blob/main/SETUP.md#google-sign-in-optional`;

/** Why users bring their own Google client ID. */
export function GoogleWhy() {
  return (
    <div className="cal-why">
      <p>
        <b>Why do I need my own Google client ID?</b> TabNest is a free, open-source app with no server or company behind it. To let an app sign in to Google
        Calendar, Google asks for a “client ID” that is registered to a person, who answers to Google for it (its limits, its review and its users). So TabNest
        doesn’t come with one: you create your own, free, once, in about 10 minutes, and it stays under your control.
      </p>
      <p className="muted small">
        Only needed to <b>add, change and delete</b> events. To just <b>see</b> a Google calendar, link it with its iCal address instead (Calendar → Other calendars → +),
        no client ID needed.
      </p>
    </div>
  );
}

/** Step-by-step Google Cloud setup, with this copy's redirect address to copy. */
export function GoogleSetupSteps({ last = 'Create, then copy the Client ID into TabNest: Settings → Calendar → Google client ID.' }: { last?: string }) {
  const [copied, setCopied] = useState(false);
  const redirect = redirectUri();
  return (
    <div className="cal-help">
      <p>One-time setup in Google Cloud (free, no credit card), with any Google account:</p>
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
              type="button"
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
        <li>{last}</li>
      </ol>
      <p className="muted small">
        The redirect address belongs to this copy of TabNest. A copy loaded from another folder (or from a store) has a different one: add that too. Company Google
        Workspace accounts may need the IT admin to allow the app. Google's free allowance is far more than one person or team needs.
      </p>
    </div>
  );
}

/** The guide in its own window: why, the steps, and a link to the same guide online. */
export function GoogleSetupGuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Set up your own Google client ID"
      onClose={onClose}
      wide
      footer={
        <>
          <a className="link-btn" href={GOOGLE_GUIDE_URL} target="_blank" rel="noreferrer">
            Open this guide online
          </a>
          <span className="grow" />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <GoogleWhy />
      <GoogleSetupSteps />
    </Modal>
  );
}
