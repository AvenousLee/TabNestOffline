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

describe('master password recovery', () => {
  it('gets the master password back with the right picture and word only', async () => {
    const { makeRecovery, recoverMaster } = await import('./lock');
    const r = await makeRecovery('my-master', 'rocket', 'Blue Lagoon');
    expect(r.masterRecovery).not.toContain('my-master');
    expect(await recoverMaster(r.masterRecovery, 'rocket', '  blue lagoon ')).toBe('my-master'); // case and spaces don't matter
    await expect(recoverMaster(r.masterRecovery, 'cat', 'blue lagoon')).rejects.toThrow(/don’t match/);
    await expect(recoverMaster(r.masterRecovery, 'rocket', 'red lagoon')).rejects.toThrow(/don’t match/);
    await expect(recoverMaster(undefined, 'rocket', 'blue lagoon')).rejects.toThrow(/No recovery/);
  });

  it('keeps the same picture and word when the master password changes', async () => {
    const { makeRecovery, moveRecovery, recoverMaster } = await import('./lock');
    const r = await makeRecovery('old-master', 'anchor', 'harbour');
    const moved = await moveRecovery(r.recoveryByMaster, 'old-master', 'new-master');
    expect(await recoverMaster(moved.masterRecovery, 'anchor', 'harbour')).toBe('new-master');
  });
});

describe('recovery pictures and secret words', () => {
  it('works with the emoji itself, any emoji of the user, and ignores case and extra spaces in the secret words', async () => {
    const { makeRecovery, recoverMaster } = await import('./lock');
    const r = await makeRecovery('pw-123456', '🦄', 'Penang  Beach trip');
    expect(await recoverMaster(r.masterRecovery, '🦄', ' penang beach   TRIP ')).toBe('pw-123456');
    await expect(recoverMaster(r.masterRecovery, '🐱', 'penang beach trip')).rejects.toThrow(/don’t match/);
    // With or without the emoji presentation mark, it's the same picture.
    const s2 = await makeRecovery('pw-123456', '☀️', 'two words');
    expect(await recoverMaster(s2.masterRecovery, '☀', 'two words')).toBe('pw-123456');
  });

  it('still opens recoveries from the first version (picture by id)', async () => {
    const { makeRecovery, recoverMaster } = await import('./lock');
    const r = await makeRecovery('pw-123456', 'rocket', 'Falcon');
    expect(await recoverMaster(r.masterRecovery, 'rocket', 'falcon')).toBe('pw-123456');
  });

  it('offers six different pictures, including the chosen one', async () => {
    const { pickRecoveryChoices } = await import('./lock');
    const six = pickRecoveryChoices();
    expect(six).toHaveLength(6);
    expect(new Set(six).size).toBe(6);
    const mine = pickRecoveryChoices('🦄');
    expect(mine).toHaveLength(6);
    expect(mine).toContain('🦄');
    expect(pickRecoveryChoices('🐱').filter((e) => e === '🐱')).toHaveLength(1);
  });

  it('accepts exactly one emoji as the own picture', async () => {
    const { oneEmoji, countWords } = await import('./lock');
    expect(oneEmoji(' 🦄 ')).toBe('🦄');
    expect(oneEmoji('👍🏽')).toBe('👍🏽');
    expect(oneEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(oneEmoji('🦄🐱')).toBe('');
    expect(oneEmoji('a')).toBe('');
    expect(countWords('  penang   beach ')).toBe(2);
    expect(countWords('')).toBe(0);
  });
});
