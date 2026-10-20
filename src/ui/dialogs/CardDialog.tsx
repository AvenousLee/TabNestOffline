import { useState } from 'react';
import { useStore } from '../../store/store';
import { Field, Modal } from '../Modal';
import type { CardTarget } from '../SpaceView';

export function CardDialog({ target, onClose }: { target: CardTarget; onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(target.card?.title ?? '');
  const [url, setUrl] = useState(target.card?.url ?? '');
  const [note, setNote] = useState(target.card?.note ?? '');

  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : url.trim() ? `https://${url.trim()}` : '';
  let valid = false;
  try {
    valid = !!new URL(normalized);
  } catch {
    valid = false;
  }

  const save = () => {
    if (!valid) return;
    const data = { title: title.trim() || normalized, url: normalized, note: note.trim() || undefined };
    if (target.card) s.updateCard(target.spaceId, target.colId, target.card.id, data);
    else s.addCard(target.spaceId, target.colId, data);
    onClose();
  };

  return (
    <Modal
      title={target.card ? 'Edit link' : 'Add link'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Link">
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shown on the card" />
        </Field>
        <Field label="Note" hint="Optional. Shown under the title instead of the website name.">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
