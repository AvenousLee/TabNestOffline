import { useState } from 'react';
import { unlockNote } from '../lib/lock';
import { Field, Modal } from './Modal';
import { Icon } from './icons';
import { useStore } from '../store/store';
import { MasterPasswordDialog } from './MasterPasswordDialog';

/** Ask for the password of a locked card description (every time; nothing is remembered). */
export function UnlockDialog({
  title,
  lock,
  onUnlocked,
  onClose,
}: {
  title: string;
  lock: string;
  onUnlocked: (text: string, password: string) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const prefs = useStore((st) => st.prefs);
  const [resetting, setResetting] = useState(false);

  const unlock = async () => {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      onUnlocked(await unlockNote(lock, password), password);
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
          {prefs.masterCheck && (
            <button className="link-btn" onClick={() => setResetting(true)}>
              Forgot the master password?
            </button>
          )}
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
        <Field label="Password" hint="Your master password (or the card’s own password, for descriptions locked before the master password was set).">
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </Field>
        {prefs.masterHint && (
          <p className="muted small">
            <b>Hint:</b> {prefs.masterHint}
          </p>
        )}
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
      {/* After a reset the descriptions are locked again with the new password: close and unlock again. */}
      {resetting && <MasterPasswordDialog mode="reset" onClose={() => (setResetting(false), useStore.getState().prefs.masterCheck !== prefs.masterCheck && onClose())} />}
    </Modal>
  );
}
