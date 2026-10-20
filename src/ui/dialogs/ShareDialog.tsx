import { useState } from 'react';
import { useStore } from '../../store/store';
import { serializeSpaceFile, toSpaceFile } from '../../lib/spaceFile';
import { slugify } from '../../lib/util';
import { buildBundle, buildShareHtml, downloadText, resolveCheckUrl, shareFileName } from '../../share/share';
import { Field, Modal } from '../Modal';
import { Icon } from '../icons';

/** Export one or more spaces as an offline HTML file. */
export function ShareDialog({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const s = useStore();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const chosen = s.spaces.filter((sp) => picked.has(sp.id));
  const [name, setName] = useState(s.profile.name);
  const [contact, setContact] = useState(s.profile.contact);
  const anyChecks = chosen.some((sp) => sp.share.mode === 'check');

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportHtml = () => {
    const profile = { name: name.trim(), contact: contact.trim() };
    if (profile.name !== s.profile.name || profile.contact !== s.profile.contact) s.saveProfile(profile);
    downloadText(shareFileName(chosen), buildShareHtml(buildBundle(chosen, s.remotes, profile)), 'text/html');
    s.showToast('Share file downloaded. Send it by email, Teams or a shared drive.');
    onClose();
  };

  const exportJson = () => {
    for (const sp of chosen) downloadText(`${slugify(sp.name)}.json`, serializeSpaceFile(toSpaceFile(sp)), 'application/json');
  };

  return (
    <Modal
      title="Share spaces"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" disabled={!chosen.length} onClick={exportJson} title="Raw space file(s), for git or for other TabNest users">
            <Icon name="download" /> .json
          </button>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!chosen.length} onClick={exportHtml}>
            <Icon name="download" /> Download HTML file
          </button>
        </>
      }
    >
      <p className="muted">
        Makes one <b>.html</b> file anyone can open in a browser, no TabNest needed. They can browse, search and open the links. TabNest users can import it.
        Tokens and settings are never included.
      </p>
      <ul className="share-list">
        {s.spaces.map((sp) => {
          const url = resolveCheckUrl(sp, s.remotes);
          const n = sp.collections.reduce((a, c) => a + c.cards.length, 0);
          return (
            <li key={sp.id}>
              <label className="check">
                <input type="checkbox" checked={picked.has(sp.id)} onChange={() => toggle(sp.id)} />
                <span className="space-dot" style={{ background: sp.color }} />
                <b>{sp.name}</b>
                <span className="muted small">{n} tabs</span>
              </label>
              <span className={`pill${url ? ' on' : ''}`} title={url ?? undefined}>
                {sp.share.mode === 'check' ? (url ? 'Checks for updates' : 'Check for updates: no link set') : 'Snapshot'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Change snapshot or update checking for each space in its settings (⋯ next to Share).</p>
      <h3>Shared by</h3>
      <p className="muted small">
        Shown in the file. {anyChecks ? 'If a reader cannot check for updates (for example, no Forgejo access), the file tells them to ask you for a new copy.' : 'Readers know whom to ask for a newer copy.'}
      </p>
      <div className="row">
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Avenous" />
        </Field>
        <Field label="Contact" hint="Email gives readers a one-click “ask for the latest version” link. Or a Teams name.">
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="name@company.com" />
        </Field>
      </div>
    </Modal>
  );
}
