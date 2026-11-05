import { useState } from 'react';
import { rememberUnlocked, unlockNote } from '../lib/lock';
import { Field, Modal } from './Modal';
import { Icon } from './icons';

/** Ask for the password of a locked card description. It stays unlocked in this tab until the tab is closed. */
export function UnlockDialog({
  cardId,
  title,
  lock,
  onUnlocked,
  onClose,
}: {
  cardId: string;
  title: string;
  lock: string;
  onUnlocked: (text: string, password: string) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const text = await unlockNote(lock, password);
      rememberUnlocked(cardId, lock, text, password);
      onUnlocked(text, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Locked description"
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!password || busy} onClick={() => void unlock()}>
            <Icon name="lock" /> {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <p className="muted small" style={{ marginTop: 0 }}>
          The description of <b>{title}</b> is protected with a password.
        </p>
        <Field label="Password">
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </Field>
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
