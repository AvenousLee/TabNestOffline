import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { useCalendar } from '../calendar/calStore';
import { requestHostAccess } from '../browser/tabs';
import { loadEverything, replaceEverything } from '../storage/storage';
import { backupFileName, describeBackup, makeBackup, readBackup } from '../lib/backup';
import { downloadText } from '../share/share';
import { ABOUT, appVersion } from '../about';
import { Field } from './Modal';
import { Icon } from './icons';

const ALL_SITES = ['https://*/*', 'http://*/*'];
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

/** One place for your profile, general options, accounts, backup, and who made TabNest. */
export function SettingsPage({ onRemotes }: { onRemotes: () => void }) {
  return (
    <main className="space-view settings-page">
      <header className="space-head">
        <span className="space-dot big cal-page-icon">
          <Icon name="settings" size={15} />
        </span>
        <span className="space-name">Settings</span>
      </header>
      <div className="settings">
        <ProfileSection />
        <GeneralSection />
        <AccountsSection onRemotes={onRemotes} />
        <BackupSection />
        <AboutSection />
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Avenous Lee" />
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

function GeneralSection() {
  const s = useStore();
  const toggleAuto = async (on: boolean) => {
    // Automatic previews read every saved page, so they need access to all websites (asked once).
    if (on && !(await requestHostAccess(ALL_SITES))) return;
    s.savePrefs({ ...s.prefs, autoPreview: on });
  };
  return (
    <Section title="General">
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
  const cal = useCalendar();
  const [clientId, setClientId] = useState('');
  useEffect(() => {
    void cal.load().then(() => setClientId(useCalendar.getState().clientId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const idChanged = clientId.trim() !== cal.clientId;

  return (
    <Section title="Accounts & connections">
      <h3>Git repositories</h3>
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
        <p className="muted small">None yet. Spaces can sync through your own GitHub, Forgejo or GitLab repositories.</p>
      )}
      <button className="btn" onClick={onRemotes}>
        <Icon name="git" /> Manage Git repositories
      </button>

      <h3>Google calendars</h3>
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
        <div className="row-actions">
          <button className="btn" disabled={!idChanged}>
            Save client ID
          </button>
          <button type="button" className="btn" onClick={() => s.openCalendar()}>
            <Icon name="calendar" /> Open Calendar
          </button>
        </div>
      </form>
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
        Include secrets: Git tokens and iCal calendar links <span className="muted small">(anyone with the file could use them)</span>
      </label>
      {!withSecrets && <p className="muted small">Without secrets you enter the Git tokens again after restoring, and iCal calendars are left out.</p>}
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
  const contact = ABOUT.contact.trim();
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
          {ABOUT.author.trim() ? (
            <>
              <b className="about-author">{ABOUT.author}</b>
              {ABOUT.byline.trim() && <span>{ABOUT.byline}</span>}
              {contact &&
                (isEmail(contact) ? (
                  <a href={`mailto:${contact}`}>{contact}</a>
                ) : (
                  <a href={contact} target="_blank" rel="noreferrer">
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
    </Section>
  );
}
