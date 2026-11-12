import { useState } from 'react';
import { useStore } from '../store/store';
import {
  isMasterPassword,
  makeMasterCheck,
  makeRecovery,
  MIN_MASTER,
  MIN_RECOVERY_WORD,
  moveRecovery,
  recoverMaster,
  RECOVERY_ICONS,
  type Recovery,
} from '../lib/lock';
import { Field, Modal } from './Modal';
import { Icon } from './icons';

/**
 * set: a first master password (with recovery picture + word, and a hint).
 * change: a new one, knowing the current one (recovery is kept).
 * recovery: set up or replace the recovery picture + word and hint, knowing the current one.
 * reset: forgot it: the picture + word let you choose a new one.
 * remove: no master password any more.
 */
export type MasterMode = 'set' | 'change' | 'recovery' | 'reset' | 'remove';

const TITLES: Record<MasterMode, string> = {
  set: 'Set a master password',
  change: 'Change the master password',
  recovery: 'Recovery picture and word',
  reset: 'Forgot the master password?',
  remove: 'Remove the master password',
};

/** One of the six pictures (radio buttons styled as tiles). */
function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="recovery-icons" role="radiogroup" aria-label="Recovery picture">
      {RECOVERY_ICONS.map((i) => (
        <button key={i.id} type="button" role="radio" aria-checked={value === i.id} aria-label={i.label} title={i.label} className={value === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>
          {i.emoji}
        </button>
      ))}
    </div>
  );
}

/** Set, change, reset or remove the master password that locks card descriptions. */
export function MasterPasswordDialog({ mode, onClose }: { mode: MasterMode; onClose: () => void }) {
  const s = useStore();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [icon, setIcon] = useState('');
  const [word, setWord] = useState('');
  const [hint, setHint] = useState(s.prefs.masterHint ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const hasRecovery = !!s.prefs.masterRecovery;
  const needsCurrent = mode === 'change' || mode === 'remove' || mode === 'recovery';
  const needsNext = mode === 'set' || mode === 'change' || mode === 'reset';
  // Picture + word: chosen when setting up (set, recovery), asked back when resetting.
  const needsRecovery = mode === 'set' || mode === 'recovery' || mode === 'reset';
  const editsHint = mode === 'set' || mode === 'recovery';
  const nextOk = !needsNext || (next.length >= MIN_MASTER && next === again);
  const recoveryOk = !needsRecovery || (!!icon && word.trim().length >= (mode === 'reset' ? 1 : MIN_RECOVERY_WORD));
  const hintLeaks = editsHint && !!hint.trim() && ((!!next && hint.toLowerCase().includes(next.toLowerCase())) || (!!word.trim() && hint.toLowerCase().includes(word.trim().toLowerCase())));
  const ready = (!needsCurrent || !!current) && nextOk && recoveryOk && !hintLeaks;

  // The picture + word: chosen when setting up (after the password), asked back first when resetting.
  const recoveryFields = needsRecovery && (mode !== 'reset' || hasRecovery) && (
    <div className="recovery-box">
      <b className="small">{mode === 'reset' ? 'Your recovery picture and word' : 'If you forget it: a recovery picture and word'}</b>
      {mode !== 'reset' && (
        <p className="muted small">
          Pick a picture and a word only you would think of. Together they can reset the master password, so don’t use something others could guess
          (like a pet’s name).
        </p>
      )}
      <IconPicker value={icon} onChange={setIcon} />
      <Field label="Recovery word" hint={mode === 'reset' ? 'Upper/lower case doesn’t matter.' : `At least ${MIN_RECOVERY_WORD} characters. Upper/lower case doesn’t matter.`}>
        <input value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
    </div>
  );

  const run = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const prefs = useStore.getState().prefs;
      if (needsCurrent && !(await isMasterPassword(prefs.masterCheck, current))) throw new Error('That is not the current master password.');
      if (mode === 'remove') {
        s.savePrefs({ ...prefs, masterCheck: undefined, masterRecovery: undefined, recoveryByMaster: undefined, masterHint: undefined });
        s.showToast('Master password removed. Locked descriptions still open with the old password.');
        onClose();
        return;
      }
      if (mode === 'recovery') {
        s.savePrefs({ ...prefs, ...(await makeRecovery(current, icon, word)), masterHint: hint.trim() || undefined });
        s.showToast('Recovery picture and word saved.');
        onClose();
        return;
      }
      // The old master password: typed (change) or recovered with the picture + word (reset).
      const old = mode === 'change' ? current : mode === 'reset' ? await recoverMaster(prefs.masterRecovery, icon, word) : '';
      if (mode === 'reset' && !(await isMasterPassword(prefs.masterCheck, old))) {
        throw new Error('The recovery is out of date (the master password was changed elsewhere). It can’t reset this one.');
      }
      const masterCheck = await makeMasterCheck(next);
      // Re-lock every description locked with the old one, so they open with the new one.
      const moved = old ? await s.relockNotes(old, next) : 0;
      let recovery: Partial<Recovery> = {};
      if (mode === 'set' || mode === 'reset') recovery = await makeRecovery(next, icon, word);
      else if (prefs.recoveryByMaster) recovery = await moveRecovery(prefs.recoveryByMaster, old, next);
      s.savePrefs({ ...useStore.getState().prefs, masterCheck, ...recovery, ...(editsHint ? { masterHint: hint.trim() || undefined } : {}) });
      const what = moved ? `; ${moved} locked ${moved === 1 ? 'description' : 'descriptions'} updated` : '';
      s.showToast(mode === 'set' ? 'Master password set.' : mode === 'reset' ? `New master password set${what}.` : `Master password changed${what}.`);
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
      wide={needsRecovery}
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn ${mode === 'remove' ? 'danger' : 'primary'}`} disabled={!ready || busy} onClick={() => void run()}>
            <Icon name="lock" /> {busy ? 'Working…' : mode === 'remove' ? 'Remove' : mode === 'reset' ? 'Reset password' : 'Save'}
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
            Descriptions already locked stay locked and still open with this password. The recovery picture and word are removed too.
          </p>
        )}
        {mode === 'reset' &&
          (hasRecovery ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              Choose the picture and type the recovery word you set with the master password, then a new master password. Locked descriptions
              will open with the new one.
            </p>
          ) : (
            <div className="status-line err">
              No recovery picture and word were set up on this device, so the master password can’t be reset. Locked descriptions can only be opened
              with it.
            </div>
          ))}
        {mode === 'reset' && s.prefs.masterHint && (
          <div className="status-line warn">
            <b>Your hint:</b> {s.prefs.masterHint}
          </div>
        )}

        {needsCurrent && (
          <Field label="Current master password">
            <input type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}

        {mode === 'reset' && recoveryFields}

        {needsNext && (mode !== 'reset' || hasRecovery) && (
          <div className="row">
            <Field label={mode === 'set' ? 'Master password' : 'New master password'} hint={`At least ${MIN_MASTER} characters.`}>
              <input type="password" autoFocus={!needsCurrent && mode !== 'reset'} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Type it again" hint={again && next !== again ? 'The passwords don’t match.' : undefined}>
              <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        )}

        {mode !== 'reset' && recoveryFields}

        {editsHint && (
          <Field
            label="Password hint (optional)"
            hint={hintLeaks ? 'The hint can’t contain the password or the recovery word: anyone can read it.' : 'Shown when the master password is asked for. Anyone can read it.'}
          >
            <input value={hint} onChange={(e) => setHint(e.target.value)} maxLength={80} placeholder="e.g. the name of my first bike" />
          </Field>
        )}

        {needsNext && mode !== 'reset' && (
          <div className="status-line warn">Without the password or the recovery picture and word, locked descriptions can’t be opened by anyone.</div>
        )}
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
