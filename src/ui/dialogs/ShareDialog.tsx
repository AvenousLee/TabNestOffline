import { useState } from 'react';
import { useStore } from '../../store/store';
import { serializeSpaceFile, toSpaceFile } from '../../lib/spaceFile';
import { slugify } from '../../lib/util';
import { buildBundle, buildShareHtml, downloadText, resolveCheckUrl, shareBaseName, shareFileName } from '../../share/share';
import { buildPrintHtml, embedLinkedImages, linkedImageOrigins, printToPdf } from '../../share/print';
import { requestHostAccess } from '../../browser/tabs';
import { Field, Modal } from '../Modal';
import { Icon } from '../icons';

/** Export one or more spaces as an offline HTML file or a PDF. */
export function ShareDialog({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const s = useStore();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const chosen = s.spaces.filter((sp) => picked.has(sp.id));
  const [name, setName] = useState(s.profile.name);
  const [contact, setContact] = useState(s.profile.contact);
  const anyChecks = chosen.some((sp) => sp.share.mode === 'check');
  const [format, setFormat] = useState<'html' | 'pdf'>('html');
  const [embed, setEmbed] = useState(true);
  const [busy, setBusy] = useState('');
  const linkedCount = chosen.reduce((n, sp) => n + sp.collections.reduce((m, c) => m + c.cards.filter((k) => k.image && /^https?:/i.test(k.image)).length, 0), 0);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Runs from a click: asking for access to the picture websites must happen first.
  const doExport = async () => {
    const profile = { name: name.trim(), contact: contact.trim() };
    if (profile.name !== s.profile.name || profile.contact !== s.profile.contact) s.saveProfile(profile);
    let bundle = buildBundle(chosen, s.remotes, profile);
    let note = '';
    try {
      if (embed && linkedCount) {
        const origins = linkedImageOrigins(bundle);
        if (await requestHostAccess(origins)) {
          setBusy('Adding pictures to the file…');
          const res = await embedLinkedImages(bundle);
          bundle = res.bundle;
          if (res.failed) note = ` ${res.failed} linked picture(s) couldn't be downloaded and stay as links.`;
        } else note = ' Linked pictures stay as links (no permission to download them).';
      }
      if (format === 'html') {
        downloadText(shareFileName(chosen), buildShareHtml(bundle), 'text/html');
        s.showToast(`Share file downloaded. Send it by email, Teams or a shared drive.${note}`);
      } else {
        setBusy('Opening the print window…');
        await printToPdf(buildPrintHtml(bundle), shareBaseName(chosen));
        if (note) s.showToast(note.trim());
      }
      onClose();
    } catch (e) {
      s.showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
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
          <button className="btn primary" disabled={!chosen.length || !!busy} onClick={() => void doExport()}>
            <Icon name="download" /> {busy || (format === 'html' ? 'Download HTML file' : 'Save as PDF…')}
          </button>
        </>
      }
    >
      <div className="policy-list">
        <label className={`policy${format === 'html' ? ' on' : ''}`}>
          <input type="radio" name="format" checked={format === 'html'} onChange={() => setFormat('html')} />
          <b>HTML file</b>
          <span>Opens in any browser, no TabNest needed: browse, search, open links. Can check for updates. TabNest users can import it.</span>
        </label>
        <label className={`policy${format === 'pdf' ? ' on' : ''}`}>
          <input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />
          <b>PDF</b>
          <span>A printable, read-only page with clickable links. Chrome's print window opens. Choose “Save as PDF” as the printer.</span>
        </label>
      </div>
      <p className="muted small">Tokens and settings are never included.</p>
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
      {linkedCount > 0 && (
        <label className="check">
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} />
          Include linked pictures in the file ({linkedCount}), so they show offline. Uploaded pictures are always included.
        </label>
      )}
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
