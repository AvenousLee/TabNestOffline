import { describe, expect, it } from 'vitest';
import { isNoteLock, lockNote, unlockNote } from './lock';

describe('password-protected descriptions', () => {
  it('encrypts so the text is not readable, and unlocks with the right password only', async () => {
    const lock = await lockNote('Server: 10.0.0.5 · login ops', 'correct horse');
    expect(isNoteLock(lock)).toBe(true);
    expect(lock).not.toContain('10.0.0.5');
    expect(await unlockNote(lock, 'correct horse')).toBe('Server: 10.0.0.5 · login ops');
    await expect(unlockNote(lock, 'wrong')).rejects.toThrow('Wrong password.');
  });

  it('gives a different result each time (random salt and IV), and keeps non-English text', async () => {
    const a = await lockNote('日本語のメモ', 'pw');
    const b = await lockNote('日本語のメモ', 'pw');
    expect(a).not.toBe(b);
    expect(await unlockNote(b, 'pw')).toBe('日本語のメモ');
  });

  it('refuses something that is not a lock', async () => {
    expect(isNoteLock('hello')).toBe(false);
    await expect(unlockNote('hello', 'pw')).rejects.toThrow(/damaged/);
  });
});

describe('master password', () => {
  it('recognises the master password from its check value, without storing it', async () => {
    const { makeMasterCheck, isMasterPassword } = await import('./lock');
    const check = await makeMasterCheck('master-pass');
    expect(check).not.toContain('master-pass');
    expect(await isMasterPassword(check, 'master-pass')).toBe(true);
    expect(await isMasterPassword(check, 'other')).toBe(false);
    expect(await isMasterPassword(undefined, 'master-pass')).toBe(false);
  });
});
