import { beforeEach, describe, expect, it } from 'vitest';
import type { Space } from '../types';
import { useStore } from './store';

const space = (id: string, cols: Array<[string, string[]]>): Space => ({
  id,
  name: id,
  color: '#4c7bd6',
  updatedAt: '2026-11-01T00:00:00.000Z',
  share: { mode: 'snapshot' },
  collections: cols.map(([cid, cards]) => ({ id: cid, name: cid, cards: cards.map((k) => ({ id: k, title: k, url: `https://${k}.test/` })) })),
});

describe('copy or move collections between spaces', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ spaces: [space('Work', [['Tools', ['a', 'b']], ['Docs', ['c']], ['Misc', []]]), space('Home', [['Fun', ['d']]])] });
  });

  it('copies chosen collections with new ids and keeps the originals', () => {
    expect(useStore.getState().transferCollections('Work', ['Tools', 'Misc'], 'Home', 'copy')).toBe(2);
    const [work, home] = useStore.getState().spaces;
    expect(work.collections.map((c) => c.name)).toEqual(['Tools', 'Docs', 'Misc']);
    expect(home.collections.map((c) => c.name)).toEqual(['Fun', 'Tools', 'Misc']);
    const copy = home.collections[1];
    expect(copy.id).not.toBe('Tools');
    expect(copy.cards.map((k) => k.title)).toEqual(['a', 'b']);
    expect(copy.cards.some((k) => k.id === 'a' || k.id === 'b')).toBe(false);
  });

  it('moves chosen collections out of the space', () => {
    expect(useStore.getState().transferCollections('Work', ['Docs'], 'Home', 'move')).toBe(1);
    const [work, home] = useStore.getState().spaces;
    expect(work.collections.map((c) => c.name)).toEqual(['Tools', 'Misc']);
    expect(home.collections.map((c) => c.id)).toEqual(['Fun', 'Docs']);
  });

  it('does nothing for the same space or unknown collections', () => {
    expect(useStore.getState().transferCollections('Work', ['Tools'], 'Work', 'move')).toBe(0);
    expect(useStore.getState().transferCollections('Work', ['nope'], 'Home', 'copy')).toBe(0);
    expect(useStore.getState().spaces[1].collections).toHaveLength(1);
  });
});
