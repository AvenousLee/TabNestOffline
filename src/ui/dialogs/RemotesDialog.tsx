import { useState } from 'react';
import type { Remote } from '../../types';
import { useStore } from '../../store/store';
import { requestHostAccess } from '../../browser/tabs';
import { connectRepo, KIND_NAMES, parseRepoAddress, repoWebUrl, tokenHelp, type ConnectResult } from '../../sync/providers';
import { Field, Modal } from '../Modal';
import { Icon } from '../icons';

/** Manage connected repositories. Each space picks one (and a file path inside it). */
export function RemotesDialog({ onClose, editId, tokenOnly }: { onClose: () => void; editId?: string; tokenOnly?: boolean }) {
  const s = useStore();
  // Opened for one repository (e.g. from a sync error): edit it straight away, close when done.
  const start = editId ? s.remotes.find((r) => r.id === editId) : undefined;
  const [editing, setEditing] = useState<Remote | 'new' | null>(start ?? (s.remotes.length ? null : 'new'));
  const [mode, setMode] = useState<'full' | 'token'>(start && tokenOnly ? 'token' : 'full');
  const usedBy = (id: string) => s.spaces.filter((sp) => sp.sync?.target.type === 'repo' && sp.sync.target.remoteId === id);

  return (
    <Modal title="Git repositories" onClose={onClose} wide>
      {editing ? (
        <RemoteForm
          remote={editing === 'new' ? undefined : editing}
          mode={mode}
          onCancel={() => (start || !s.remotes.length ? onClose() : setEditing(null))}
          onSave={(r, message) => {
            s.saveRemote(r);
            s.showToast(message);
            setEditing(null);
            if (start) onClose();
          }}
        />
      ) : (
        <>
          <p className="muted">
            Repositories TabNest can save spaces into, e.g. one on your company server for work and one on GitHub for personal. Many spaces can share a
            repository; each is a separate file in it.
          </p>
          <ul className="remote-list">
            {s.remotes.map((r) => (
              <li key={r.id}>
                <Icon name="git" />
                <div>
                  <b>{r.label || `${r.owner}/${r.repo}`}</b>
                  <div className="muted small">
                    {repoWebUrl(r)} · {KIND_NAMES[r.kind]} · {r.branch} · {r.readOnly ? 'read-only' : 'can upload'} · used by {usedBy(r.id).length} space(s)
                  </div>
                </div>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setMode('token');
                    setEditing(r);
                  }}
                >
                  Update token
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setMode('full');
                    setEditing(r);
                  }}
                >
                  Edit
                </button>
                <button
                  className="icon-btn"
                  title="Remove"
                  onClick={() => {
                    const n = usedBy(r.id).length;
                    if (!n || confirm(`${n} space(s) sync with this repository and will stop syncing. Remove it?`)) s.deleteRemote(r.id);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add repository
          </button>
        </>
      )}
    </Modal>
  );
}

/**
 * Connect a repository from just its address. TabNest works out the server
 * type, tries without signing in, and asks for a token only if it's needed.
 * mode 'token' = only replace the access token of an already-connected repository.
 */
export function RemoteForm({
  remote,
  onSave,
  onCancel,
  saveLabel = 'Connect',
  mode = 'full',
}: {
  remote?: Remote;
  onSave: (r: Remote, message: string) => void;
  onCancel: () => void;
  saveLabel?: string;
  mode?: 'full' | 'token';
}) {
  const tokenOnly = mode === 'token' && !!remote;
  const savedToken = remote?.token ?? '';
  const [address, setAddress] = useState(remote ? repoWebUrl(remote) : '');
  // Starts empty: leaving it empty keeps the saved token, typing replaces it.
  const [token, setToken] = useState('');
  const [branch, setBranch] = useState(remote?.branch ?? '');
  const [label, setLabel] = useState(remote?.label ?? '');
  const [needsToken, setNeedsToken] = useState<Extract<ConnectResult, { status: 'needs-token' }> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokenField, setTokenField] = useState(!!savedToken || tokenOnly);
  const parsed = parseRepoAddress(address);

  // Runs from a click: Chrome only shows its "allow access to this server" prompt in response to one.
  const connect = async () => {
    if (!parsed) return;
    setBusy(true);
    setError('');
    try {
      const host = parsed.host === 'github.com' || parsed.host === 'www.github.com' ? 'api.github.com' : parsed.host;
      if (!(await requestHostAccess(`https://${host}`))) throw new Error(`TabNest needs permission to talk to ${parsed.host}. Please click Allow.`);
      const res = await connectRepo(address, token.trim() || savedToken, { branch, existing: remote });
      if (res.status === 'needs-token') {
        setNeedsToken(res);
        return;
      }
      onSave({ ...res.remote, label: label.trim() || res.remote.label }, tokenOnly ? `Token updated. ${res.message}` : res.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Outside the extension (npm run dev), the browser blocks servers that don't allow web pages to call them.
      const preview = typeof chrome === 'undefined' || !chrome.runtime?.id;
      setError(
        preview && /could not reach/i.test(msg)
          ? `${msg} Note: this is the localhost preview, which your server blocks. Inside the installed TabNest extension it can connect.`
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const help = needsToken
    ? tokenHelp(needsToken.kind, needsToken.baseUrl)
    : remote
      ? tokenHelp(remote.kind, remote.kind === 'github' ? 'https://github.com' : remote.baseUrl)
      : null;
  const showToken = !!needsToken || tokenField;
  const canSubmit = !!parsed && !busy && !(needsToken && !token.trim()) && !(tokenOnly && !token.trim());

  return (
    <form
      className="remote-form"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      {tokenOnly ? (
        <p className="muted">
          Repository: <b>{remote.owner}/{remote.repo}</b> ({repoWebUrl(remote)})
        </p>
      ) : (
        <Field
          label="Repository address"
          hint="Copy it from the repository page (the Clone button, or the browser address bar). GitHub, GitLab and Forgejo/Gitea all work."
        >
          <input
            autoFocus
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setNeedsToken(null);
              setError('');
            }}
            placeholder="git@git.company.net:Team/Repo.git  or  https://github.com/me/my-spaces"
          />
        </Field>
      )}
      {!tokenOnly && address.trim() && !parsed && <div className="status-line warn">That doesn’t look like a repository address yet.</div>}

      {needsToken && <div className="status-line warn">{needsToken.message}</div>}
      {showToken && (
        <Field
          label={savedToken ? 'New access token' : 'Access token'}
          hint={
            help && (
              <>
                <a href={help.url} target="_blank" rel="noreferrer">
                  Create a token here
                </a>
                : {help.text}
              </>
            )
          }
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            autoFocus={!!needsToken || tokenOnly}
            placeholder={savedToken ? 'A token is saved. Paste a new one to replace it, or leave empty to keep it.' : ''}
          />
        </Field>
      )}
      {showToken && <p className="muted small">The token is kept only in this browser's TabNest storage. It is never put in shared files or in the repo.</p>}

      {remote && !tokenOnly && (
        <details className="advanced" open>
          <summary>Advanced</summary>
          <div className="row">
            <Field label="Name" hint="Shown in TabNest. Default: the repository name.">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={parsed?.repo ?? ''} />
            </Field>
            <Field label="Branch" hint="Empty = the repository's default branch.">
              <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="default" />
            </Field>
          </div>
        </details>
      )}
      {!showToken && (
        <button type="button" className="link-btn" onClick={() => setTokenField(true)}>
          I already have an access token
        </button>
      )}

      {error && <div className="status-line err">{error}</div>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!canSubmit}>
          {busy ? 'Checking…' : tokenOnly ? 'Save token' : saveLabel}
        </button>
      </div>
    </form>
  );
}
