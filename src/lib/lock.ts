// Password-protected card descriptions. The text is encrypted (AES-GCM 256,
// key from the password with PBKDF2-SHA256), so it stays unreadable wherever
// the space goes: browser storage, git repositories, shared files, backups.
// There is no way back without the password.
//
// Stored as one string: "v1.<salt>.<iv>.<ciphertext>" (base64url), so sync
// and merge treat it like any other card field. viewer.js reads the same format.
//
// Cards are locked with the master password (Settings → General). TabNest never
// stores it: only a small check value encrypted with it, to tell a typo from the
// right password. Unlocked text is never kept: it is asked for every time.

const ITERATIONS = 210_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function keyFor(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export const isNoteLock = (s: unknown): s is string => typeof s === 'string' && /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/.test(s);

export async function lockNote(text: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(password, salt), enc.encode(text)));
  return ['v1', toB64(salt), toB64(iv), toB64(data)].join('.');
}

export async function unlockNote(lock: string, password: string): Promise<string> {
  if (!isNoteLock(lock)) throw new Error('This locked description is damaged.');
  const [, salt, iv, data] = lock.split('.');
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await keyFor(password, fromB64(salt)), fromB64(data));
    return dec.decode(plain);
  } catch {
    throw new Error('Wrong password.');
  }
}

/** Shortest master password accepted. */
export const MIN_MASTER = 6;
const CHECK_TEXT = 'tabnest-master-password';

/** The value saved in settings to recognise the master password later (not the password itself). */
export const makeMasterCheck = (password: string) => lockNote(CHECK_TEXT, password);

// Recovery: a picture (1 of 6) and a recovery word, chosen with the master password.
// Together they unlock a copy of the master password kept in settings, so a forgotten
// master password can be replaced. They are as strong as the word is hard to guess.

export const RECOVERY_ICONS = [
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'sunflower', emoji: '🌻', label: 'Sunflower' },
  { id: 'rocket', emoji: '🚀', label: 'Rocket' },
  { id: 'balloon', emoji: '🎈', label: 'Balloon' },
  { id: 'anchor', emoji: '⚓', label: 'Anchor' },
  { id: 'clover', emoji: '🍀', label: 'Clover' },
] as const;
export const MIN_RECOVERY_WORD = 4;

/** Upper/lower case and spaces around the word don't matter. */
const recoverySecret = (icon: string, word: string) => `tabnest-recovery:${icon}:${word.trim().toLowerCase()}`;

export interface Recovery {
  /** The master password, encrypted with the picture + word. */
  masterRecovery: string;
  /** The picture + word, encrypted with the master password (to keep them when it changes). */
  recoveryByMaster: string;
}

async function recoveryFor(secret: string, master: string): Promise<Recovery> {
  return { masterRecovery: await lockNote(master, secret), recoveryByMaster: await lockNote(secret, master) };
}

export const makeRecovery = (master: string, icon: string, word: string) => recoveryFor(recoverySecret(icon, word), master);

/** The master password, from the right picture and word. */
export async function recoverMaster(masterRecovery: string | undefined, icon: string, word: string): Promise<string> {
  if (!masterRecovery) throw new Error('No recovery picture and word were set up.');
  try {
    return await unlockNote(masterRecovery, recoverySecret(icon, word));
  } catch {
    throw new Error('That picture and word don’t match.');
  }
}

/** Keep the same picture and word when the master password changes. */
export async function moveRecovery(recoveryByMaster: string, oldMaster: string, newMaster: string): Promise<Recovery> {
  return recoveryFor(await unlockNote(recoveryByMaster, oldMaster), newMaster);
}

export async function isMasterPassword(check: string | undefined, password: string): Promise<boolean> {
  if (!check || !password) return false;
  try {
    return (await unlockNote(check, password)) === CHECK_TEXT;
  } catch {
    return false;
  }
}
