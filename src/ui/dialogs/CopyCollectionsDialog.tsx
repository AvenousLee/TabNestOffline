import { useState } from 'react';
import { useStore } from '../../store/store';
import { followsOthers } from '../../sync/engine';
import { Field, Modal } from '../Modal';

const NEW = '__new';

/** Pick collections of a space and copy or move them to another (or a new) space. */
export function CopyCollectionsDialog({ spaceId, initial, onClose }: { spaceId: string; initial: string[]; onClose: () => void }) {
  const s = useStore();
  const from = s.spaces.find((x) => x.id === spaceId);
  const targets = s.spaces.filter((x) => x.id !== spaceId && !followsOthers(x));
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [to, setTo] = useState(targets[0]?.id ?? NEW);
  const [newName, setNewName] = useState('');
  // A space that only follows someone else's repo can't lose collections: copy only.
  const canMove = !!from && !followsOthers(from);
  const [mode, setMode] = useState<'copy' | 'move'>('copy');
  if (!from) return null;

  const all = picked.size === from.collections.length && from.collections.length > 0;
  const toggle = (id: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ready = picked.size > 0 && (to !== NEW || !!newName.trim());
  const verb = mode === 'copy' ? 'Copy' : 'Move';
  const what = `${picked.size} ${picked.size === 1 ? 'collection' : 'collections'}`;

  const run = () => {
    if (!ready) return;
    const target = to === NEW ? s.addSpace(newName.trim()) : to;
    const name = s.spaces.find((x) => x.id === target)?.name ?? newName.trim();
    // Keep the order the collections have in the space.
    const ids = from.collections.map((c) => c.id).filter((id) => picked.has(id));
    const n = s.transferCollections(from.id, ids, target, mode);
    if (to === NEW) s.setActive(from.id); // creating a space opens it; stay here
    s.showToast(`${mode === 'copy' ? 'Copied' : 'Moved'} ${n} ${n === 1 ? 'collection' : 'collections'} to ${name}.`);
    onClose();
  };

  return (
    <Modal
      title="Copy or move collections"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted small">
            From <b>{from.name}</b>
          </span>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ready} onClick={run}>
            {picked.size ? `${verb} ${what}` : 'Tick the collections first'}
          </button>
        </>
      }
    >
      <div className="seg">
        <button className={mode === 'copy' ? 'on' : ''} onClick={() => setMode('copy')}>
          Copy
        </button>
        <button className={mode === 'move' ? 'on' : ''} disabled={!canMove} onClick={() => setMode('move')} title={canMove ? undefined : 'This space follows someone else’s copy, so collections can only be copied out of it.'}>
          Move
        </button>
      </div>
      <p className="muted small">{mode === 'copy' ? 'The collections stay here too; the new space gets its own copy.' : 'The collections leave this space and go to the other one.'}</p>

      <div className="copy-cols-head">
        <b className="small">Collections</b>
        <button className="link-btn" onClick={() => setPicked(all ? new Set() : new Set(from.collections.map((c) => c.id)))}>
          {all ? 'Select none' : 'Select all'}
        </button>
      </div>
      <div className="cal-choose">
        {from.collections.map((c) => (
          <label key={c.id} className="check cal-choose-row">
            <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="cal-choose-name">{c.name}</span>
            <span className="muted small">
              {c.cards.length} {c.cards.length === 1 ? 'link' : 'links'}
            </span>
          </label>
        ))}
        {!from.collections.length && <p className="muted small">This space has no collections.</p>}
      </div>

      <div className="row">
        <Field label={mode === 'copy' ? 'Copy to' : 'Move to'}>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {targets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
            <option value={NEW}>+ New space…</option>
          </select>
        </Field>
        {to === NEW && (
          <Field label="New space name">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Project X" />
          </Field>
        )}
      </div>
      {s.spaces.length - 1 > targets.length && <p className="muted small">Spaces that follow someone else’s copy are not listed: they can’t be changed here.</p>}
    </Modal>
  );
}
