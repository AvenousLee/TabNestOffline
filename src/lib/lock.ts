// Password-protected card descriptions. The text is encrypted (AES-GCM 256,
// key from the password with PBKDF2-SHA256), so it stays unreadable wherever
// the space goes: browser storage, git repositories, shared files, backups.
// There is no way back without the password.
//
// Stored as one string: "v1.<salt>.<iv>.<ciphertext>" (base64url), so sync
// and merge treat it like any other card field. viewer.js reads the same format.

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

// Descriptions unlocked in this tab stay readable until the tab is closed (never saved anywhere).
const unlocked = new Map<string, { lock: string; text: string; password: string }>();

/** The text and password of a description unlocked earlier in this tab (only while the lock is unchanged). */
export function unlockedNote(cardId: string, lock: string): { text: string; password: string } | undefined {
  const u = unlocked.get(cardId);
  return u && u.lock === lock ? u : undefined;
}

export function rememberUnlocked(cardId: string, lock: string, text: string, password: string): void {
  unlocked.set(cardId, { lock, text, password });
}

export function forgetUnlocked(cardId: string): void {
  unlocked.delete(cardId);
}
