import { describe, expect, it } from 'vitest';
import type { Space } from '../types';
import { contentOf, toSpaceFile, validateSpaceFile } from './spaceFile';
import { lockNote, unlockNote } from './lock';
import { buildBundle, buildShareHtml, parseImport } from '../share/share';
import { buildPrintHtml } from '../share/print';
import { mergeSpaces } from '../sync/merge';

const space = (cards: Space['collections'][number]['cards']): Space => ({
  id: 's',
  name: 'Work',
  color: '#4c7bd6',
  updatedAt: '2026-11-05T00:00:00.000Z',
  share: { mode: 'snapshot' },
  collections: [{ id: 'c', name: 'Servers', cards }],
});

describe('hidden and password-protected descriptions', () => {
  it('keep their state through space files, and a lock wins over plain text', async () => {
    const lock = await lockNote('root password is hunter2', 'pw1234');
    const s = space([
      { id: 'a', title: 'Hidden', url: 'https://a.test/', note: 'later', noteHidden: true },
      { id: 'b', title: 'Locked', url: 'https://b.test/', noteLock: lock, note: 'should be dropped' },
    ]);
    const back = validateSpaceFile(JSON.parse(JSON.stringify(toSpaceFile(s))));
    const [a, b] = back.content.collections[0].cards;
    expect(a).toMatchObject({ note: 'later', noteHidden: true });
    expect(b.noteLock).toBe(lock);
    expect(b.note).toBeUndefined();
    expect(await unlockNote(b.noteLock!, 'pw1234')).toBe('root password is hunter2');
    expect(contentOf({ name: 'x', color: '#000', collections: [{ id: 'c', name: 'c', cards: [{ id: 'z', title: 't', url: '', noteLock: 'not a lock', noteHidden: true }] }] }).collections[0].cards[0]).toEqual({ id: 'z', title: 't', url: '' });
  });

  it('never put a locked text into shared files or PDFs, and show hidden ones as hidden in the PDF', async () => {
    const lock = await lockNote('secret text', 'pw1234');
    const s = space([
      { id: 'a', title: 'Hidden', url: 'https://a.test/', note: 'folded text', noteHidden: true },
      { id: 'b', title: 'Locked', url: 'https://b.test/', noteLock: lock },
    ]);
    const html = buildShareHtml(buildBundle([s], []));
    expect(html).not.toContain('secret text');
    expect(parseImport(html)[0].content.collections[0].cards[1].noteLock).toBe(lock);
    const pdf = buildPrintHtml(buildBundle([s], []));
    expect(pdf).toContain('🔒 Locked description');
    expect(pdf).toContain('Hidden description');
    expect(pdf).not.toContain('folded text');
  });

  it('merge: locking on one device carries over to the other', async () => {
    const lock = await lockNote('x', 'pw1234');
    const base = contentOf(space([{ id: 'a', title: 'A', url: 'https://a.test/', note: 'x' }]));
    const mine = contentOf(space([{ id: 'a', title: 'A', url: 'https://a.test/', noteLock: lock }]));
    const { merged } = mergeSpaces(base, mine, base);
    expect(contentOf(merged).collections[0].cards[0]).toEqual({ id: 'a', title: 'A', url: 'https://a.test/', noteLock: lock });
  });
});
