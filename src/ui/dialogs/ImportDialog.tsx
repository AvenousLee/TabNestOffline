import { useState } from 'react';
import type { SpaceFile } from '../../types';
import { useStore } from '../../store/store';
import { requestHostAccess } from '../../browser/tabs';
import { parseImport } from '../../share/share';
import { Modal } from '../Modal';
import { Icon } from '../icons';

type Item = SpaceFile & { checkUrl?: string };

/** Import a shared .html file (or a space .json) into your own spaces. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      setItems(parseImport(await file.text()));
    } catch (e) {
      setItems(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const canFollow = !!items?.some((i) => i.checkUrl);
  const replacing = items?.filter((i) => s.spaces.some((sp) => sp.id === i.id)) ?? [];

  const doImport = async () => {
    if (!items) return;
    if (follow && canFollow) {
      // Permission prompt must come straight from this click.
      const origins = [...new Set(items.filter((i) => i.checkUrl).map((i) => new URL(i.checkUrl!).origin))];
      await requestHostAccess(origins);
    }
    const ids = await s.importSpaces(items, follow && canFollow);
    s.showToast(`Imported ${ids.length} space(s).`);
    if (follow && canFollow) ids.forEach((id) => void s.syncNow(id, false));
    onClose();
  };

  return (
    <Modal
      title="Import shared spaces"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!items?.length} onClick={() => void doImport()}>
            Import {items?.length ? `${items.length} space(s)` : ''}
          </button>
        </>
      }
    >
      <label
        className="drop-file"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void read(e.dataTransfer.files[0]);
        }}
      >
        <Icon name="upload" size={22} />
        <span>Choose or drop a TabNest .html or .json file someone shared with you</span>
        <input type="file" accept=".html,.htm,.json" hidden onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {error && <div className="status-line err">{error}</div>}
      {items && (
        <ul className="share-list">
          {items.map((i) => (
            <li key={i.id}>
              <span className="space-dot" style={{ background: i.content.color }} />
              <b>{i.content.name}</b>
              <span className="muted small">
                {i.content.collections.length} collections · {i.content.collections.reduce((n, c) => n + c.cards.length, 0)} tabs · {new Date(i.updatedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {replacing.length > 0 && (
        <div className="status-line warn">
          You already have {replacing.map((r) => `“${r.content.name}”`).join(', ')}. Importing replaces the links with the version in this file.
        </div>
      )}
      {canFollow && (
        <label className="check">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Follow for updates. TabNest checks the original and asks before applying changes. You can change this in Space settings.
        </label>
      )}
    </Modal>
  );
}
