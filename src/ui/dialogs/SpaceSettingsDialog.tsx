import { useState } from 'react';
import type { ShareSettings, Space, SyncConfig, UpdatePolicy } from '../../types';
import { SPACE_COLORS, useStore } from '../../store/store';
import { requestHostAccess } from '../../browser/tabs';
import { slugify } from '../../lib/util';
import { resolveCheckUrl } from '../../share/share';
import { Field, Modal } from '../Modal';
import { RemoteForm } from './RemotesDialog';

type Mode = 'off' | 'repo' | 'url';

const NEW = '__new__';

const POLICIES: { value: UpdatePolicy; label: string; text: string }[] = [
  { value: 'auto', label: 'Auto-pull', text: 'Apply updates straight away (if you have no unsaved local changes).' },
  { value: 'ask', label: 'Ask me', text: 'Show a banner so I can pull or ignore each update.' },
  { value: 'ignore', label: 'Ignore', text: 'Stay quiet. I will press Sync now when I want updates.' },
];

export function SpaceSettingsDialog({ space, onClose }: { space: Space; onClose: () => void }) {
  const s = useStore();
  const t = space.sync?.target;
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState(space.color);
  const [mode, setMode] = useState<Mode>(t?.type ?? 'off');
  const [remoteId, setRemoteId] = useState(t?.type === 'repo' ? t.remoteId : (s.remotes[0]?.id ?? ''));
  const [path, setPath] = useState(t?.type === 'repo' ? t.path : `spaces/${slugify(space.name)}.json`);
  const [followRepo, setFollowRepo] = useState(t?.type === 'repo' && !!t.follow);
  const [addingRemote, setAddingRemote] = useState(s.remotes.length === 0);
  const [connected, setConnected] = useState('');
  const [editingRemote, setEditingRemote] = useState<false | 'full' | 'token'>(false);
  const chosenRemote = s.remotes.find((r) => r.id === remoteId);
  const [url, setUrl] = useState(t?.type === 'url' ? t.url : '');
  const [policy, setPolicy] = useState<UpdatePolicy>(space.sync?.policy ?? 'ask');
  const [autoPush, setAutoPush] = useState(space.sync?.autoPush ?? true);
  const [share, setShare] = useState<ShareSettings>(space.share);

  const sameTarget = (a: SyncConfig['target'] | undefined, b: SyncConfig['target']) => JSON.stringify(a) === JSON.stringify(b);

  const save = async () => {
    let sync: SyncConfig | null = null;
    if (mode === 'repo' && remoteId && path.trim()) {
      const target = { type: 'repo' as const, remoteId, path: path.trim().replace(/^\/+/, ''), ...(followRepo ? { follow: true } : {}) };
      // Changing where a space syncs means starting over: forget the old shared version.
      const keep = sameTarget(space.sync?.target, target) ? space.sync : undefined;
      sync = { ...keep, target, policy, autoPush: followRepo ? false : autoPush };
    } else if (mode === 'url' && /^https?:\/\//.test(url.trim())) {
      const target = { type: 'url' as const, url: url.trim() };
      if (!(await requestHostAccess(new URL(target.url).origin))) return;
      const keep = sameTarget(space.sync?.target, target) ? space.sync : undefined;
      sync = { ...keep, target, policy, autoPush: false };
    }
    const newName = name.trim() || space.name;
    if (newName !== space.name || color !== space.color) s.updateSpaceMeta(space.id, { name: newName, color });
    s.updateSpaceSettings(space.id, { sync, share });
    onClose();
    if (sync) void s.syncNow(space.id, true);
  };

  const preview: Space = { ...space, share, sync: mode === 'repo' ? { target: { type: 'repo', remoteId, path, follow: followRepo }, policy, autoPush } : mode === 'url' ? { target: { type: 'url', url }, policy, autoPush: false } : undefined };
  const checkUrl = resolveCheckUrl(preview, s.remotes);

  return (
    <Modal
      title="Space settings"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(`Delete the space “${space.name}” from this device? Copies in git are not deleted.`)) {
                s.deleteSpace(space.id);
                onClose();
              }
            }}
          >
            Delete space
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={mode === 'repo' && (addingRemote || editingRemote !== false)}
            title={mode === 'repo' && addingRemote ? 'Connect the repository first' : undefined}
            onClick={() => void save()}
          >
            Save
          </button>
        </>
      }
    >
      <div className="row">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Colour">
          <div className="swatches">
            {SPACE_COLORS.map((c) => (
              <button key={c} className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </Field>
      </div>

      <h3>Sync across devices</h3>
      <div className="seg">
        <button className={mode === 'off' ? 'on' : ''} onClick={() => setMode('off')}>
          Off (this device only)
        </button>
        <button className={mode === 'repo' ? 'on' : ''} onClick={() => setMode('repo')}>
          Git repository
        </button>
        <button className={mode === 'url' ? 'on' : ''} onClick={() => setMode('url')}>
          Follow a shared link
        </button>
      </div>

      {mode === 'repo' &&
        (addingRemote || (editingRemote && chosenRemote) ? (
          <div className="inline-panel">
            <div className="field-label">{addingRemote ? 'Add the repository for this space' : editingRemote === 'token' ? 'Update access token' : 'Repository details'}</div>
            <RemoteForm
              remote={addingRemote ? undefined : chosenRemote}
              mode={editingRemote === 'token' ? 'token' : 'full'}
              saveLabel={addingRemote ? 'Connect' : 'Save changes'}
              onCancel={() => {
                setEditingRemote(false);
                if (s.remotes.length) setAddingRemote(false);
                else setMode('off');
              }}
              onSave={(r, message) => {
                s.saveRemote(r);
                setConnected(message);
                setRemoteId(r.id);
                setAddingRemote(false);
                setEditingRemote(false);
              }}
            />
          </div>
        ) : (
          <>
          <div className="policy-list">
            <label className={`policy${!followRepo ? ' on' : ''}`}>
              <input type="radio" name="role" checked={!followRepo} onChange={() => setFollowRepo(false)} />
              <b>My space</b>
              <span>Two-way: my edits are uploaded, and changes from my other devices come back.</span>
            </label>
            <label className={`policy${followRepo ? ' on' : ''}`}>
              <input type="radio" name="role" checked={followRepo} onChange={() => setFollowRepo(true)} />
              <b>Follow (pull only)</b>
              <span>Someone else's space: I get their updates, my edits stay on this device. Read access is enough.</span>
            </label>
          </div>
          <div className="row">
            <Field label="Repository">
              <select value={remoteId} onChange={(e) => (e.target.value === NEW ? setAddingRemote(true) : setRemoteId(e.target.value))}>
                {s.remotes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.owner}/{r.repo})
                  </option>
                ))}
                <option value={NEW}>+ Add a new repository…</option>
              </select>
            </Field>
            <Field
              label="File in the repo"
              hint={
                followRepo
                  ? 'Use the same path the owner uses (shown in their Space settings).'
                  : 'Each space is one JSON file. Use the same path on every device. A repo just for this space can use space.json.'
              }
            >
              <input value={path} onChange={(e) => setPath(e.target.value)} />
            </Field>
          </div>
          {connected && <div className="status-line ok">{connected}</div>}
          {chosenRemote && (
            <div className="link-row">
              <button type="button" className="link-btn" onClick={() => setEditingRemote('token')}>
                Update token
              </button>
              <button type="button" className="link-btn" onClick={() => setEditingRemote('full')}>
                Change name or branch
              </button>
            </div>
          )}
          {!followRepo && chosenRemote?.readOnly && (
            <div className="status-line warn">
              You can only read this repository, so your changes can't be uploaded. Choose Follow, or reconnect it with a token that has write access (Git
              repositories → Reconnect).
            </div>
          )}
          </>
        ))}

      {mode === 'url' && (
        <Field label="Space file link" hint="A raw link to someone's space file (e.g. raw.githubusercontent.com/…/space.json). Read-only: you get their updates, your edits stay here.">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/spaces/team.json" />
        </Field>
      )}

      {mode !== 'off' && (
        <>
          <div className="field-label">When the other copy changes</div>
          <div className="policy-list">
            {POLICIES.map((p) => (
              <label key={p.value} className={`policy${policy === p.value ? ' on' : ''}`}>
                <input type="radio" name="policy" checked={policy === p.value} onChange={() => setPolicy(p.value)} />
                <b>{p.label}</b>
                <span>{p.text}</span>
              </label>
            ))}
          </div>
          {mode === 'repo' && !followRepo && (
            <label className="check">
              <input type="checkbox" checked={autoPush} onChange={(e) => setAutoPush(e.target.checked)} />
              Upload my changes automatically (a few seconds after each edit)
            </label>
          )}
        </>
      )}

      <h3>Offline sharing</h3>
      <p className="muted small">Share exports this space as one .html file. Anyone can open it in a browser, no extension needed.</p>
      <div className="policy-list">
        <label className={`policy${share.mode === 'snapshot' ? ' on' : ''}`}>
          <input type="radio" name="share" checked={share.mode === 'snapshot'} onChange={() => setShare({ ...share, mode: 'snapshot' })} />
          <b>Snapshot</b>
          <span>A frozen copy. Send a new file to share changes.</span>
        </label>
        <label className={`policy${share.mode === 'check' ? ' on' : ''}`}>
          <input type="radio" name="share" checked={share.mode === 'check'} onChange={() => setShare({ ...share, mode: 'check' })} />
          <b>Check for updates</b>
          <span>When opened, the file looks for a newer version and offers to show it (the reader can ignore it).</span>
        </label>
      </div>
      {share.mode === 'check' && (
        <Field
          label="Update link (optional)"
          hint={
            checkUrl ? (
              <>
                The file will check: <code>{checkUrl}</code>. Readers need access to this link: a public repo, or your company network for Forgejo.
              </>
            ) : (
              'Set up Git sync above, or paste a public link to this space file.'
            )
          }
        >
          <input value={share.checkUrl ?? ''} onChange={(e) => setShare({ ...share, checkUrl: e.target.value })} placeholder="Leave empty to use the git sync file" />
        </Field>
      )}
    </Modal>
  );
}
