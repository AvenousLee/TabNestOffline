import { useState } from 'react';
import { useStore } from '../store/store';
import { isMasterPassword, makeMasterCheck, MIN_MASTER } from '../lib/lock';
import { Field, Modal } from './Modal';
import { Icon } from './icons';

export type MasterMode = 'set' | 'change' | 'remove';

const TITLES: Record<MasterMode, string> = { set: 'Set a master password', change: 'Change the master password', remove: 'Remove the master password' };

/** Set, change or remove the master password that locks card descriptions. */
export function MasterPasswordDialog({ mode, onClose }: { mode: MasterMode; onClose: () => void }) {
  const s = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsCurrent = mode !== 'set';
  const needsNext = mode !== 'remove';
  const nextOk = !needsNext || (next.length >= MIN_MASTER && next === again);
  const ready = (!needsCurrent || !!current) && nextOk;

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      if (needsCurrent && !(await isMasterPassword(s.prefs.masterCheck, current))) throw new Error('That is not the current master password.');
      if (mode === 'remove') {
        s.savePrefs({ ...s.prefs, masterCheck: undefined });
        s.showToast('Master password removed. Locked descriptions still open with the old password.');
      } else {
        const masterCheck = await makeMasterCheck(next);
        // Changing it: re-lock the descriptions locked with the old one, so they open with the new one.
        const moved = mode === 'change' ? await s.relockNotes(current, next) : 0;
        s.savePrefs({ ...useStore.getState().prefs, masterCheck });
        s.showToast(mode === 'set' ? 'Master password set.' : `Master password changed${moved ? `; ${moved} locked ${moved === 1 ? 'description' : 'descriptions'} updated` : ''}.`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={TITLES[mode]}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${mode === 'remove' ? 'danger' : 'primary'}`} disabled={!ready || busy} onClick={() => void run()}>
            <Icon name="lock" /> {busy ? 'Working…' : mode === 'remove' ? 'Remove' : 'Save'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {mode === 'set' && (
          <p className="muted small" style={{ marginTop: 0 }}>
            Locks the descriptions you mark as <b>Password</b> on cards. It’s asked for every time a locked description is opened.
          </p>
        )}
        {mode === 'remove' && (
          <p className="muted small" style={{ marginTop: 0 }}>
            Descriptions already locked stay locked and still open with this password. New ones can’t be locked until you set a master password again.
          </p>
        )}
        {needsCurrent && (
          <Field label="Current master password">
            <input type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        {needsNext && (
          <div className="row">
            <Field label={mode === 'set' ? 'Master password' : 'New master password'} hint={`At least ${MIN_MASTER} characters.`}>
              <input type="password" autoFocus={!needsCurrent} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Type it again" hint={again && next !== again ? 'The passwords don’t match.' : undefined}>
              <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        )}
        {needsNext && <div className="status-line warn">Nobody can recover it if it’s forgotten, and descriptions locked with it can’t be opened without it.</div>}
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
