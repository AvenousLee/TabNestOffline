import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useCalendar } from '../calendar/calStore';
import { googleSignInOn } from '../calendar/google';
import { GoogleSetupGuideDialog, GoogleWhy } from './calendar/GoogleSetupGuide';
import { requestHostAccess } from '../browser/tabs';
import { loadEverything, replaceEverything } from '../storage/storage';
import { backupFileName, describeBackup, makeBackup, readBackup } from '../lib/backup';
import { downloadText } from '../share/share';
import { ABOUT, appVersion } from '../about';
import { compareVersions, latestRelease, type Release } from '../lib/updates';
import { Field } from './Modal';
import { MasterPasswordDialog, type MasterMode } from './MasterPasswordDialog';
import { AUTO_HIDE_CHOICES, autoHideMinutes, autoHideOnLeave } from './autoHide';
import { Icon } from './icons';

const ALL_SITES = ['https://*/*', 'http://*/*'];
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const TABS = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'git', label: 'Git sync', icon: 'git' },
  { id: 'backup', label: 'Backup & restore', icon: 'download' },
  { id: 'about', label: 'About TabNest', icon: 'note' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Tab shown when Settings is opened again while TabNest stays open. */
let lastTab: Tab = 'general';

/** Open Settings on a given tab (e.g. from the Calendar page). */
export function settingsTab(tab: Tab): void {
  lastTab = tab;
}

/** One place for your profile, general options, calendar, Git, backup, and who made TabNest, in tabs. */
export function SettingsPage({ onRemotes }: { onRemotes: () => void }) {
  const [tab, setTab] = useState<Tab>(lastTab);
  const pick = (t: Tab) => {
    lastTab = t;
    setTab(t);
  };
  return (
    <main className="space-view settings-page">
      <header className="space-head">
        <span className="space-dot big cal-page-icon">
          <Icon name="settings" size={15} />
        </span>
        <span className="space-name">Settings</span>
      </header>
      <div className="settings-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="settings" role="tabpanel">
        {tab === 'general' && (
          <>
            <ProfileSection />
            <GeneralSection />
            <MasterPasswordSection />
          </>
        )}
        {tab === 'calendar' && <CalendarSection />}
        {tab === 'git' && <AccountsSection onRemotes={onRemotes} />}
        {tab === 'backup' && <BackupSection />}
        {tab === 'about' && <AboutSection />}
      </div>
    </main>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {hint && <p className="muted small">{hint}</p>}
      {children}
    </section>
  );
}

function ProfileSection() {
  const s = useStore();
  const [name, setName] = useState(s.profile.name);
  const [contact, setContact] = useState(s.profile.contact);
  const changed = name.trim() !== s.profile.name || contact.trim() !== s.profile.contact;
  return (
    <Section title="Your profile" hint="Shown as “Owner” and “Shared by” in the files and PDFs you share, so readers know whom to ask.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          s.saveProfile({ name: name.trim(), contact: contact.trim() });
          s.showToast('Profile saved.');
        }}
      >
        <div className="row">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Tan" />
          </Field>
          <Field label="Contact" hint="Email (becomes a mail link) or e.g. a Teams name.">
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="name@company.com" />
          </Field>
        </div>
        <button className="btn primary" disabled={!changed}>
          Save
        </button>
      </form>
    </Section>
  );
}

/** Master password for card descriptions marked “Password”. */
function MasterPasswordSection() {
  const s = useStore();
  const [mode, setMode] = useState<MasterMode | null>(null);
  const set = !!s.prefs.masterCheck;
  return (
    <Section title="Master password & privacy" hint="Locks card descriptions marked “Password” (card ✎ → Who can read the description). It’s asked for every time one is opened.">
      <p className="switch-line check" style={{ cursor: 'default' }}>
        <Icon name="lock" />
        <b>{set ? 'A master password is set.' : 'No master password yet.'}</b>
      </p>
      {set && (
        <p className={`small ${s.prefs.masterRecovery ? 'muted' : 'warn-text'}`}>
          {s.prefs.masterRecovery
            ? 'Recovery picture and word are set up: they can reset the master password if you forget it.'
            : 'No recovery picture and word yet: if you forget the master password, locked descriptions are lost. Set them up now.'}
          {s.prefs.masterHint && <> Hint: “{s.prefs.masterHint}”.</>}
        </p>
      )}
      <div className="row-actions">
        {set ? (
          <>
            <button className="btn" onClick={() => setMode('change')}>
              Change master password…
            </button>
            <button className={`btn${s.prefs.masterRecovery ? '' : ' primary'}`} onClick={() => setMode('recovery')}>
              {s.prefs.masterRecovery ? 'Change recovery picture & word…' : 'Set up recovery…'}
            </button>
            <button className="btn ghost" onClick={() => setMode('reset')}>
              Forgot it?
            </button>
            <button className="btn ghost danger" onClick={() => setMode('remove')}>
              Remove
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={() => setMode('set')}>
            <Icon name="lock" /> Set master password…
          </button>
        )}
      </div>
      <p className="muted small">TabNest never saves the password itself. Only your recovery picture and word can reset it.</p>

      <h3>Hide opened descriptions again</h3>
      <p className="muted small">Like a screen lock: opened hidden or locked descriptions close by themselves, and locked ones need the password again.</p>
      <div className="row">
        <Field label="After no mouse or keyboard use for">
          <select value={autoHideMinutes(s.prefs)} onChange={(e) => s.savePrefs({ ...s.prefs, noteAutoHideMinutes: Number(e.target.value) })}>
            {AUTO_HIDE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'Never' : m === 1 ? '1 minute' : `${m} minutes`}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={autoHideOnLeave(s.prefs)} onChange={(e) => s.savePrefs({ ...s.prefs, noteAutoHideOnLeave: e.target.checked })} />
        Also as soon as I switch to another tab or minimise the window
      </label>
      {mode && <MasterPasswordDialog mode={mode} onClose={() => setMode(null)} />}
    </Section>
  );
}

function GeneralSection() {
  const s = useStore();
  const toggleAuto = async (on: boolean) => {
    // Automatic previews read every saved page, so they need access to all websites (asked once).
    if (on && !(await requestHostAccess(ALL_SITES))) return;
    s.savePrefs({ ...s.prefs, autoPreview: on });
  };
  const start = s.spaces.some((x) => x.id === s.prefs.startSpaceId) ? s.prefs.startSpaceId! : '';
  return (
    <Section title="General">
      <Field label="Default space" hint="Opens in every new tab. You can also set it with ⋯ next to a space in the sidebar → Set as default space.">
        <select value={start} onChange={(e) => s.savePrefs({ ...s.prefs, startSpaceId: e.target.value || undefined })}>
          <option value="">The first space in the list{s.spaces[0] ? ` (now: ${s.spaces[0].name})` : ''}</option>
          {s.spaces.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="check switch-line">
        <input type="checkbox" role="switch" checked={!!s.prefs.openCardsInNewTab} onChange={(e) => s.savePrefs({ ...s.prefs, openCardsInNewTab: e.target.checked })} />
        <b>Open cards in a new tab</b>
        <span className="muted small">
          {s.prefs.openCardsInNewTab ? 'Clicking a card opens its link in a new tab; TabNest stays open.' : 'Clicking a card opens its link in this tab (Ctrl+click for a new tab).'}
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.prefs.autoPreview} onChange={(e) => void toggleAuto(e.target.checked)} />
        Automatically add website previews when I save tabs <span className="muted small">(Chrome asks once for access to all websites)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={!s.prefs.leftCollapsed} onChange={(e) => s.savePrefs({ ...s.prefs, leftCollapsed: !e.target.checked })} />
        Show the spaces sidebar <span className="muted small">(key [ )</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={!s.prefs.rightCollapsed} onChange={(e) => s.savePrefs({ ...s.prefs, rightCollapsed: !e.target.checked })} />
        Show the Open Tabs panel <span className="muted small">(key ] )</span>
      </label>
    </Section>
  );
}

function AccountsSection({ onRemotes }: { onRemotes: () => void }) {
  const s = useStore();
  return (
    <Section title="Git sync" hint="Spaces can sync through your own GitHub, Forgejo or GitLab repositories.">
      {s.remotes.length ? (
        <ul className="settings-list">
          {s.remotes.map((r) => (
            <li key={r.id}>
              <Icon name="git" size={14} /> <b>{r.label}</b>
              <span className="muted small">
                {r.kind} · {r.owner}/{r.repo}
                {r.token ? '' : ' · no token'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No repositories yet.</p>
      )}
      <button className="btn" onClick={onRemotes}>
        <Icon name="git" /> Manage Git repositories
      </button>
    </Section>
  );
}

/** Calendar: switch it on or off, and its accounts and links. */
function CalendarSection() {
  const s = useStore();
  const cal = useCalendar();
  const on = s.prefs.calendarEnabled !== false;
  const [clientId, setClientId] = useState('');
  useEffect(() => {
    void cal.load().then(() => setClientId(useCalendar.getState().clientId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const idChanged = clientId.trim() !== cal.clientId;
  const linked = cal.sources.filter((x) => x.kind !== 'google');
  const google = googleSignInOn(s.prefs.googleSignIn, cal.accounts.length);
  const [guide, setGuide] = useState(false);

  return (
    <Section title="Calendar" hint="One page with your Google calendars, iCal links and webmail calendars.">
      <label className="check switch-line">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => s.savePrefs({ ...s.prefs, calendarEnabled: e.target.checked })} />
        <b>Use the Calendar</b>
        <span className="muted small">{on ? 'Shown in the sidebar.' : 'Hidden. Your calendars and accounts are kept for when you switch it back on.'}</span>
      </label>

      {on && (
        <>
          <label className="check switch-line">
            <input type="checkbox" role="switch" checked={google} onChange={(e) => s.savePrefs({ ...s.prefs, googleSignIn: e.target.checked })} />
            <b>Sign in with Google accounts</b>
            <span className="muted small">
              {google ? 'Add, change and delete events in your own Google calendars.' : cal.accounts.length ? `Off. Your ${cal.accounts.length} Google account(s) are kept but hidden.` : 'Off. You can still see Google calendars through their iCal address.'}
            </span>
          </label>
        </>
      )}

      {on && google && (
        <>
          <GoogleWhy />
          <button className="btn" onClick={() => setGuide(true)}>
            <Icon name="note" /> Open the setup guide
          </button>
          {guide && <GoogleSetupGuideDialog onClose={() => setGuide(false)} />}

          <h3>Google accounts</h3>
          {cal.accounts.length ? (
            <ul className="settings-list">
              {cal.accounts.map((a) => (
                <li key={a.email}>
                  <Icon name="calendar" size={14} /> <b>{a.email}</b>
                  <span className="muted small">
                    {cal.sources.filter((x) => x.account === a.email).length} calendars shown
                    {a.needsSignIn ? ' · signed out' : ''}
                  </span>
                  <button
                    className="link-btn danger small"
                    onClick={() => confirm(`Remove ${a.email} and its calendars from TabNest? (Nothing is deleted in Google.)`) && cal.removeAccount(a.email)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No Google account yet. Add one on the Calendar page (“My calendars” → +).</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              cal.setClientId(clientId);
              s.showToast('Google client ID saved.');
            }}
          >
            <Field label="Google client ID" hint="From Google Cloud; used to sign in to all your Google accounts.">
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="….apps.googleusercontent.com" spellCheck={false} />
            </Field>
            <button className="btn" disabled={!idChanged}>
              Save client ID
            </button>
          </form>
        </>
      )}

      {on && (
        <>
          <h3>Other calendars</h3>
          {linked.length ? (
            <ul className="settings-list">
              {linked.map((x) => (
                <li key={x.id}>
                  <span className="cal-swatch" style={{ background: x.color }} /> <b>{x.name}</b>
                  <span className="muted small">{x.kind === 'caldav' ? `webmail · ${x.username}` : 'iCal link'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None yet. Add iCal links and webmail calendars on the Calendar page (“Other calendars” → +).</p>
          )}
          <button className="btn" onClick={() => s.openCalendar()}>
            <Icon name="calendar" /> Open Calendar
          </button>
        </>
      )}
    </Section>
  );
}

function BackupSection() {
  const s = useStore();
  const [withSecrets, setWithSecrets] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = async () => {
    const backup = makeBackup(await loadEverything(), withSecrets);
    downloadText(backupFileName(), JSON.stringify(backup, null, 1), 'application/json');
    s.showToast(`Backup downloaded (${describeBackup(backup)}).`);
  };

  const restore = async (file: File) => {
    setError('');
    try {
      const backup = readBackup(await file.text());
      const when = new Date(backup.exportedAt).toLocaleString();
      if (!confirm(`Replace everything in this TabNest with the backup from ${when} (${describeBackup(backup)})?\n\nYour current spaces and settings here will be lost. Download a backup first if unsure.`)) return;
      await replaceEverything(backup.data);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Section title="Backup & restore" hint="All your spaces and settings in one file: keep it safe, or use it to move TabNest to another PC or to a new copy of TabNest.">
      <label className="check">
        <input type="checkbox" checked={withSecrets} onChange={(e) => setWithSecrets(e.target.checked)} />
        Include secrets: Git tokens, webmail calendar passwords and iCal links <span className="muted small">(anyone with the file could use them)</span>
      </label>
      {!withSecrets && <p className="muted small">Without secrets you enter Git tokens and webmail passwords again after restoring, and iCal calendars are left out.</p>}
      <div className="row-actions">
        <button className="btn primary" onClick={() => void download()}>
          <Icon name="download" /> Download backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /> Restore from backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void restore(f);
          }}
        />
      </div>
      {error && <div className="status-line err">{error}</div>}
    </Section>
  );
}

function AboutSection() {
  const name = ABOUT.author.trim();
  const contact = ABOUT.contact.trim();
  // Without a name, the contact itself is the credit.
  const contactClass = name ? undefined : 'about-author';
  return (
    <Section title="About">
      <div className="about">
        <div className="about-title">
          <img src="icons/icon-48.png" alt="" width={40} height={40} />
          <div>
            <b>TabNest</b> <span className="muted small">version {appVersion()}</span>
            <p className="muted small">{ABOUT.description}</p>
          </div>
        </div>
        <div className="about-credit">
          <span className="muted small">Created by</span>
          {name || contact ? (
            <>
              {name && <b className="about-author">{name}</b>}
              {ABOUT.byline.trim() && <span>{ABOUT.byline}</span>}
              {contact &&
                (isEmail(contact) ? (
                  <a className={contactClass} href={`mailto:${contact}`}>
                    {contact}
                  </a>
                ) : (
                  <a className={contactClass} href={contact} target="_blank" rel="noreferrer">
                    {contact}
                  </a>
                ))}
            </>
          ) : (
            <span className="about-placeholder">Author name to be added</span>
          )}
        </div>
        <a className="small" href={ABOUT.repoUrl} target="_blank" rel="noreferrer">
          Source code on GitHub
        </a>
      </div>
      <UpdatesBox />
    </Section>
  );
}

/** "Check for updates": compares this copy with the latest release on GitHub. */
function UpdatesBox() {
  const current = appVersion();
  const [state, setState] = useState<{ busy?: boolean; error?: string; release?: Release | null; checked?: boolean }>({});
  const check = async () => {
    setState({ busy: true });
    try {
      setState({ release: await latestRelease(), checked: true });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  };
  const r = state.release;
  const newer = !!r && current !== 'dev' && compareVersions(r.version, current) > 0;
  const canReload = typeof chrome !== 'undefined' && !!chrome.runtime?.reload;

  return (
    <div className="updates">
      <h3>Updates</h3>
      <div className="row-actions">
        <button className="btn" disabled={state.busy} onClick={() => void check()}>
          <Icon name="sync" className={state.busy ? 'spin' : ''} /> {state.busy ? 'Checking…' : 'Check for updates'}
        </button>
        {canReload && (
          <button className="btn ghost" onClick={() => chrome.runtime.reload()} title="Restart TabNest to use the files in its folder">
            Reload TabNest
          </button>
        )}
      </div>
      {state.error && <div className="status-line err">Couldn’t check: {state.error}</div>}
      {state.checked && r === null && <div className="status-line ok">No release has been published yet. You have version {current}.</div>}
      {state.checked && r && !newer && (
        <div className="status-line ok">
          You have the latest version ({current}
          {current === 'dev' ? `; the latest release is ${r.version}` : ''}).
        </div>
      )}
      {newer && r && (
        <div className="update-box">
          <b>
            Version {r.version} is available
          </b>{' '}
          <span className="muted small">(you have {current})</span>
          {r.notes && <p className="update-notes">{r.notes.length > 600 ? `${r.notes.slice(0, 600)}…` : r.notes}</p>}
          <ol className="small">
            <li>
              {r.zipUrl ? (
                <a href={r.zipUrl} target="_blank" rel="noreferrer">
                  Download TabNest {r.version} (.zip)
                </a>
              ) : (
                <a href={r.pageUrl} target="_blank" rel="noreferrer">
                  Open the release page
                </a>
              )}
              .
            </li>
            <li>
              Unzip it <b>into the same folder</b> TabNest is loaded from now, replacing the old files (Chrome keeps your spaces with that folder; a
              different folder starts empty).
            </li>
            <li>Click <b>Reload TabNest</b> above (or ↻ on TabNest in chrome://extensions).</li>
          </ol>
          <a className="small" href={r.pageUrl} target="_blank" rel="noreferrer">
            Release notes on GitHub
          </a>
        </div>
      )}
      <p className="muted small">
        TabNest can’t replace its own files: Chrome only lets store installs update by themselves. Download a backup first if you’re unsure
        (Backup &amp; restore).
      </p>
    </div>
  );
}
