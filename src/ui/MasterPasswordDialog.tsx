import { useState } from 'react';
import { useStore } from '../store/store';
import {
  countWords,
  isMasterPassword,
  LEGACY_RECOVERY_ICONS,
  makeMasterCheck,
  makeRecovery,
  MIN_MASTER,
  MIN_SECRET_WORDS,
  moveRecovery,
  normalWords,
  oneEmoji,
  pickRecoveryChoices,
  recoverMaster,
  type Recovery,
} from '../lib/lock';
import { Field, Modal } from './Modal';
import { Icon } from './icons';

/**
 * set: a first master password (with recovery picture and secret words).
 * change: a new one, knowing the current one (recovery is kept).
 * recovery: set up or replace the recovery picture and secret words, knowing the current one.
 * reset: forgot it: the picture + secret words let you choose a new one.
 * remove: no master password any more.
 */
export type MasterMode = 'set' | 'change' | 'recovery' | 'reset' | 'remove';

const TITLES: Record<MasterMode, string> = {
  set: 'Set a master password',
  change: 'Change the master password',
  recovery: 'Recovery picture and secret words',
  reset: 'Forgot the master password?',
  remove: 'Remove the master password',
};

/** A picture choice: `key` goes into the recovery secret, `emoji` is shown. */
interface Choice {
  key: string;
  emoji: string;
}

const shuffled = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** The six pictures to choose from when resetting (in a new order each time). */
function resetChoices(saved: string[] | undefined): Choice[] {
  if (saved?.length) return shuffled(saved.map((e) => ({ key: e, emoji: e })));
  return Object.entries(LEGACY_RECOVERY_ICONS).map(([key, emoji]) => ({ key, emoji }));
}

const fromPool = (): Choice[] => pickRecoveryChoices().map((e) => ({ key: e, emoji: e }));

/** Six pictures as tiles (radio buttons). */
function IconPicker({ choices, value, onChange }: { choices: Choice[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="recovery-icons" role="radiogroup" aria-label="Recovery picture">
      {choices.map((c) => (
        <button key={c.key} type="button" role="radio" aria-checked={value === c.key} aria-label={c.emoji} className={value === c.key ? 'on' : ''} onClick={() => onChange(c.key)}>
          {c.emoji}
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
  /** Show the new password and its repeat as plain text, to check them before saving. */
  const [showNew, setShowNew] = useState(false);
  const [choices, setChoices] = useState<Choice[]>(() => (mode === 'reset' ? resetChoices(s.prefs.recoveryIcons) : fromPool()));
  const [icon, setIcon] = useState('');
  const [own, setOwn] = useState('');
  const [words, setWords] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const hasRecovery = !!s.prefs.masterRecovery;
  const needsCurrent = mode === 'change' || mode === 'remove' || mode === 'recovery';
  const needsNext = mode === 'set' || mode === 'change' || mode === 'reset';
  // Picture + secret words: chosen when setting up (set, recovery), asked back when resetting.
  const needsRecovery = mode === 'set' || mode === 'recovery' || mode === 'reset';
  const choosing = mode === 'set' || mode === 'recovery';
  const ownEmoji = oneEmoji(own);
  const nextOk = !needsNext || (next.length >= MIN_MASTER && next === again);
  const wordsOk = countWords(words) >= (choosing ? MIN_SECRET_WORDS : 1);
  const sameAsPassword = choosing && !!normalWords(words) && normalWords(words) === normalWords(next || current);
  const recoveryOk = !needsRecovery || (!!icon && wordsOk && !sameAsPassword);
  const ready = (!needsCurrent || !!current) && nextOk && recoveryOk;

  const pickTile = (key: string) => {
    setIcon(key);
    setOwn('');
  };
  const typeOwn = (text: string) => {
    setOwn(text);
    const e = oneEmoji(text);
    setIcon(e);
  };
  /** The six pictures saved for the reset window: the chosen one and five others. */
  const savedChoices = () => (ownEmoji && icon === ownEmoji ? pickRecoveryChoices(ownEmoji) : choices.map((c) => c.key));

  const recoveryFields = needsRecovery && (mode !== 'reset' || hasRecovery) && (
    <div className="recovery-box">
      <b className="small">{mode === 'reset' ? 'Your recovery picture and secret words' : 'If you forget it: a recovery picture and secret words'}</b>
      {choosing && (
        <p className="muted small">
          A few words only you would know (like a bank’s secret word), and a picture. Together they can reset the master password, so remember
          them.
        </p>
      )}
      {/* A hint saved by an earlier version. */}
      {mode === 'reset' && s.prefs.masterHint && (
        <div className="status-line warn">
          <b>Your hint:</b> {s.prefs.masterHint}
        </div>
      )}
      <Field
        label="Secret words"
        hint={
          choosing
            ? sameAsPassword
              ? 'Use something different from the master password.'
              : `At least ${MIN_SECRET_WORDS} words. Upper/lower case and extra spaces don’t matter.`
            : 'The words you set with the master password. Upper/lower case and extra spaces don’t matter.'
        }
      >
        <input value={words} onChange={(e) => setWords(e.target.value)} autoComplete="off" spellCheck={false} placeholder={choosing ? 'e.g. blue kite summer' : ''} />
      </Field>
      <div className="small" style={{ marginTop: 6 }}>
        <b>{choosing ? 'Pick a picture' : 'Your picture'}</b>
        {choosing && <span className="muted"> · remember it: you’ll pick it again from six</span>}
      </div>
      <div className="recovery-pick">
        <IconPicker choices={choices} value={icon} onChange={pickTile} />
        {choosing && (
          <>
            <button type="button" className="btn ghost small" title="Show six other pictures" onClick={() => (setChoices(fromPool()), setIcon(ownEmoji))}>
              <Icon name="sync" /> Others
            </button>
            <label className={`recovery-own${ownEmoji && icon === ownEmoji ? ' on' : ''}`}>
              <span className="muted small">or your own emoji</span>
              <input value={own} onChange={(e) => typeOwn(e.target.value)} maxLength={16} placeholder="🙂" aria-label="Your own emoji" />
            </label>
          </>
        )}
      </div>
      {choosing && own && !ownEmoji && <div className="small warn-text">Type or paste one emoji (Windows: Win + . opens the emoji panel).</div>}
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
        s.savePrefs({ ...prefs, masterCheck: undefined, masterRecovery: undefined, recoveryByMaster: undefined, masterHint: undefined, recoveryIcons: undefined });
        s.showToast('Master password removed. Locked descriptions still open with the old password.');
        onClose();
        return;
      }
      const recoverySetup = () => ({ masterHint: undefined, recoveryIcons: savedChoices() });
      if (mode === 'recovery') {
        s.savePrefs({ ...prefs, ...(await makeRecovery(current, icon, words)), ...recoverySetup() });
        s.showToast('Recovery picture and secret words saved.');
        onClose();
        return;
      }
      // The old master password: typed (change) or recovered with the picture + secret words (reset).
      const old = mode === 'change' ? current : mode === 'reset' ? await recoverMaster(prefs.masterRecovery, icon, words) : '';
      if (mode === 'reset' && !(await isMasterPassword(prefs.masterCheck, old))) {
        throw new Error('The recovery is out of date (the master password was changed elsewhere). It can’t reset this one.');
      }
      const masterCheck = await makeMasterCheck(next);
      // Re-lock every description locked with the old one, so they open with the new one.
      const moved = old ? await s.relockNotes(old, next) : 0;
      let recovery: Partial<Recovery> = {};
      // Reset keeps the same picture and secret words, now unlocking the new password.
      if (mode === 'set' || mode === 'reset') recovery = await makeRecovery(next, icon, words);
      else if (prefs.recoveryByMaster) recovery = await moveRecovery(prefs.recoveryByMaster, old, next);
      s.savePrefs({ ...useStore.getState().prefs, masterCheck, ...recovery, ...(mode === 'set' ? recoverySetup() : {}) });
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
            Descriptions already locked stay locked and still open with this password. The recovery picture and secret words are removed
            too.
          </p>
        )}
        {mode === 'reset' &&
          (hasRecovery ? (
            <p className="muted small" style={{ marginTop: 0 }}>
              Type the secret words and pick the picture you chose with the master password, then set a new master password. Locked
              descriptions will open with the new one.
            </p>
          ) : (
            <div className="status-line err">
              No recovery picture and secret words were set up on this device, so the master password can’t be reset. Locked descriptions can only
              be opened with it.
            </div>
          ))}

        {needsCurrent && (
          <Field label="Current master password">
            <input type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}

        {mode === 'reset' && recoveryFields}

        {needsNext && (mode !== 'reset' || hasRecovery) && (
          <div className="row">
            <Field label={mode === 'set' ? 'Master password' : 'New master password'} hint={`At least ${MIN_MASTER} characters.`}>
              <input type={showNew ? 'text' : 'password'} autoFocus={!needsCurrent && mode !== 'reset'} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" spellCheck={false} />
            </Field>
            <Field label="Type it again" hint={again && next !== again ? 'The passwords don’t match.' : undefined}>
              <input type={showNew ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" spellCheck={false} />
            </Field>
          </div>
        )}
        {needsNext && (mode !== 'reset' || hasRecovery) && (
          <label className="check" style={{ marginTop: -4 }}>
            <input type="checkbox" checked={showNew} onChange={(e) => setShowNew(e.target.checked)} />
            Show password
          </label>
        )}

        {mode !== 'reset' && recoveryFields}

        {needsNext && mode !== 'reset' && (
          <div className="status-line warn">Without the password or the recovery picture and secret words, locked descriptions can’t be opened by anyone.</div>
        )}
        <button type="submit" hidden />
      </form>
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
