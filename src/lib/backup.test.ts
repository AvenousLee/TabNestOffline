import { describe, expect, it } from 'vitest';
import { backupFileName, describeBackup, makeBackup, readBackup } from './backup';

const all = {
  spaceOrder: ['a', 'b'],
  'space:a': { id: 'a', name: 'Work' },
  'space:b': { id: 'b', name: 'Home' },
  remotes: [{ id: 'r', label: 'Work', kind: 'forgejo', token: 'SECRET-TOKEN' }],
  profile: { name: 'Avenous', contact: 'a@x.test' },
  prefs: { autoPreview: true },
  calsources: [
    { id: 'i', kind: 'ical', url: 'https://cal.test/private-SECRET/basic.ics' },
    { id: 'g', kind: 'google', account: 'me@x.test', calendarId: 'me@x.test' },
  ],
  calaccounts: [{ email: 'me@x.test' }],
  'calcache:i': { text: 'BEGIN:VCALENDAR' },
  'calgcache:g': { 2026: {} },
  'calgtoken:me@x.test': { accessToken: 'ya29.SECRET' },
  lastWrite: { by: 'x', n: 1 },
};

describe('backup', () => {
  it('leaves out caches, sign-in tokens and (by default) secrets', () => {
    const b = makeBackup(all, false, new Date('2026-10-28T10:00:00Z'));
    const text = JSON.stringify(b);
    expect(text).not.toContain('SECRET');
    expect(Object.keys(b.data)).not.toContain('calcache:i');
    expect(Object.keys(b.data)).not.toContain('lastWrite');
    expect(b.data['space:a']).toEqual({ id: 'a', name: 'Work' });
    expect(b.data.remotes).toEqual([{ id: 'r', label: 'Work', kind: 'forgejo', token: '' }]);
    expect(b.data.calsources).toEqual([all.calsources[1]]);
    expect(describeBackup(b)).toBe('2 spaces, 1 git repository, 1 calendar');
  });

  it('keeps tokens and iCal links when asked, but never Google sign-in tokens', () => {
    const text = JSON.stringify(makeBackup(all, true));
    expect(text).toContain('SECRET-TOKEN');
    expect(text).toContain('private-SECRET');
    expect(text).not.toContain('ya29.SECRET');
  });

  it('reads its own files back and refuses other files', () => {
    const b = makeBackup(all, false);
    expect(readBackup(JSON.stringify(b)).data.spaceOrder).toEqual(['a', 'b']);
    expect(() => readBackup('<html>')).toThrow(/not valid JSON/);
    expect(() => readBackup(JSON.stringify({ format: 'tabnest.share', spaces: [] }))).toThrow(/Import shared file/);
    expect(() => readBackup(JSON.stringify({ ...b, version: 2 }))).toThrow(/newer TabNest/);
    expect(() => readBackup(JSON.stringify({ ...b, data: {} }))).toThrow(/damaged/);
    expect(backupFileName(new Date('2026-10-28T10:00:00Z'))).toBe('TabNest backup 2026-10-28.json');
  });
});
