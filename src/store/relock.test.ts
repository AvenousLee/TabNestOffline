import { describe, expect, it } from 'vitest';
import { lockNote, unlockNote } from '../lib/lock';
import { useStore } from './store';

describe('changing the master password', () => {
  it('re-locks descriptions locked with the old one and leaves others alone', async () => {
    localStorage.clear();
    const byMaster = await lockNote('master text', 'old-master');
    const ownPassword = await lockNote('own text', 'card-only');
    useStore.setState({
      spaces: [
        {
          id: 's',
          name: 'Work',
          color: '#4c7bd6',
          updatedAt: '2026-11-05T00:00:00.000Z',
          share: { mode: 'snapshot' },
          collections: [
            {
              id: 'c',
              name: 'C',
              cards: [
                { id: 'a', title: 'A', url: 'https://a.test/', noteLock: byMaster },
                { id: 'b', title: 'B', url: 'https://b.test/', noteLock: ownPassword },
                { id: 'd', title: 'D', url: 'https://d.test/', note: 'plain' },
              ],
            },
          ],
        },
      ],
    });
    expect(await useStore.getState().relockNotes('old-master', 'new-master')).toBe(1);
    const [a, b, d] = useStore.getState().spaces[0].collections[0].cards;
    expect(await unlockNote(a.noteLock!, 'new-master')).toBe('master text');
    await expect(unlockNote(a.noteLock!, 'old-master')).rejects.toThrow('Wrong password.');
    expect(b.noteLock).toBe(ownPassword);
    expect(d.note).toBe('plain');
  });
});
