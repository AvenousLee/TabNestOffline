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

// Recovery: a picture (one of six shown, or the user's own emoji), secret words and a secret question,
// chosen with the master password. The picture + secret words unlock a copy of the master password
// kept in settings, so a forgotten master password can be replaced. The question is shown to help
// remember the secret words, which do the real protecting.

/** The six pictures of the first version (saved recoveries name them by id). */
export const LEGACY_RECOVERY_ICONS: Record<string, string> = {
  cat: '🐱',
  sunflower: '🌻',
  rocket: '🚀',
  balloon: '🎈',
  anchor: '⚓',
  clover: '🍀',
};

/** Pictures the six choices are drawn from. */
export const RECOVERY_POOL = [
  '🐱', '🌻', '🚀', '🎈', '⚓', '🍀', '🐶', '🦊', '🐼', '🦉', '🐟', '🦋',
  '🍎', '🍕', '☕', '🎂', '🌳', '⛰️', '☀️', '🌙', '⭐', '☂️', '🎸', '⚽',
];
export const RECOVERY_CHOICES = 6;
export const MIN_SECRET_WORDS = 2;

/** Six different pictures from the pool, in random order; `mine` (if any) is one of them. */
export function pickRecoveryChoices(mine?: string, random: () => number = Math.random): string[] {
  const pool = RECOVERY_POOL.filter((e) => !mine || iconKey(e) !== iconKey(mine));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const six = pool.slice(0, mine ? RECOVERY_CHOICES - 1 : RECOVERY_CHOICES);
  if (mine) six.splice(Math.floor(random() * RECOVERY_CHOICES), 0, mine);
  return six;
}

/** The same picture with or without the emoji presentation mark. */
const iconKey = (e: string) => e.replace(/\uFE0F/g, '');

/** One emoji (a single picture character, maybe with skin tone etc.), or '' when it isn't one. */
export function oneEmoji(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].map((p) => p.segment);
  return parts.length === 1 && /\p{Extended_Pictographic}/u.test(parts[0]) ? parts[0] : '';
}

/** Secret words: upper/lower case and extra spaces don't matter. */
export const normalWords = (words: string) => words.trim().toLowerCase().replace(/\s+/g, ' ');
export const countWords = (words: string) => (normalWords(words) ? normalWords(words).split(' ').length : 0);

const recoverySecret = (icon: string, words: string) => `tabnest-recovery:${iconKey(icon)}:${normalWords(words)}`;

export interface Recovery {
  /** The master password, encrypted with the picture + secret words. */
  masterRecovery: string;
  /** The picture + secret words, encrypted with the master password (to keep them when it changes). */
  recoveryByMaster: string;
}

async function recoveryFor(secret: string, master: string): Promise<Recovery> {
  return { masterRecovery: await lockNote(master, secret), recoveryByMaster: await lockNote(secret, master) };
}

/** `icon` is the emoji itself (or, for recoveries from the first version, its id such as 'rocket'). */
export const makeRecovery = (master: string, icon: string, words: string) => recoveryFor(recoverySecret(icon, words), master);

/** The master password, from the right picture and secret words. */
export async function recoverMaster(masterRecovery: string | undefined, icon: string, words: string): Promise<string> {
  if (!masterRecovery) throw new Error('No recovery picture and secret words were set up.');
  try {
    return await unlockNote(masterRecovery, recoverySecret(icon, words));
  } catch {
    throw new Error('That picture and secret words don’t match.');
  }
}

/** Keep the same picture and secret words when the master password changes. */
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
