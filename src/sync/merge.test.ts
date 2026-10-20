import { describe, expect, it } from 'vitest';
import type { Card, SpaceContent } from '../types';
import { mergeSpaces } from './merge';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, title: id, url: `https://${id}.test/`, ...extra });
const base: SpaceContent = {
  name: 'Work',
  color: '#4c7bd6',
  collections: [
    { id: 'tools', name: 'Tools', cards: [card('a'), card('b'), card('c')] },
    { id: 'docs', name: 'Docs', cards: [card('d')] },
  ],
};
const clone = (s: SpaceContent): SpaceContent => JSON.parse(JSON.stringify(s));
const ids = (s: SpaceContent) => s.collections.map((c) => `${c.id}:${c.cards.map((k) => k.id).join('')}`);

describe('mergeSpaces', () => {
  it('keeps additions from both sides', () => {
    const mine = clone(base);
    mine.collections[0].cards.push(card('mine1'));
    const theirs = clone(base);
    theirs.collections[1].cards.unshift(card('their1'));
    const r = mergeSpaces(base, mine, theirs);
    expect(ids(r.merged)).toEqual(['tools:abcmine1', 'docs:their1d']);
    expect(r.clean).toBe(true);
  });

  it('applies deletions from either side', () => {
    const mine = clone(base);
    mine.collections[0].cards = mine.collections[0].cards.filter((k) => k.id !== 'a');
    const theirs = clone(base);
    theirs.collections = theirs.collections.filter((c) => c.id !== 'docs');
    expect(ids(mergeSpaces(base, mine, theirs).merged)).toEqual(['tools:bc']);
  });

  it('merges edits field by field', () => {
    const mine = clone(base);
    mine.collections[0].cards[0].title = 'New title';
    const theirs = clone(base);
    theirs.collections[0].cards[0].note = 'Their note';
    const r = mergeSpaces(base, mine, theirs);
    expect(r.merged.collections[0].cards[0]).toMatchObject({ title: 'New title', note: 'Their note' });
    expect(r.clean).toBe(true);
  });

  it('when both change the same field, keeps mine and says so', () => {
    const mine = clone(base);
    mine.collections[0].cards[1].title = 'Mine';
    const theirs = clone(base);
    theirs.collections[0].cards[1].title = 'Theirs';
    const r = mergeSpaces(base, mine, theirs);
    expect(r.merged.collections[0].cards[1].title).toBe('Mine');
    expect(r.clean).toBe(false);
    expect(r.notes[0]).toMatch(/changed on both sides/);
  });

  it('follows a card moved to another collection on one side', () => {
    const mine = clone(base);
    const [a] = mine.collections[0].cards.splice(0, 1);
    mine.collections[1].cards.push(a);
    const theirs = clone(base);
    theirs.collections[0].cards[2].title = 'C edited';
    const r = mergeSpaces(base, mine, theirs);
    expect(ids(r.merged)).toEqual(['tools:bc', 'docs:da']);
    expect(r.merged.collections[0].cards[1].title).toBe('C edited');
  });

  it('keeps an item deleted on one side but edited on the other', () => {
    const mine = clone(base);
    mine.collections[0].cards = mine.collections[0].cards.filter((k) => k.id !== 'b');
    const theirs = clone(base);
    theirs.collections[0].cards[1].note = 'important';
    const r = mergeSpaces(base, mine, theirs);
    expect(ids(r.merged)).toEqual(['tools:abc', 'docs:d']);
    expect(r.notes[0]).toMatch(/removed on this device but edited on the other side/);
  });

  it('cards of a deleted collection that gained new cards elsewhere are not lost', () => {
    const mine = clone(base);
    mine.collections = mine.collections.filter((c) => c.id !== 'docs');
    const theirs = clone(base);
    theirs.collections[1].cards.push(card('new'));
    const r = mergeSpaces(base, mine, theirs);
    // Docs was changed on their side, so it is kept.
    expect(ids(r.merged)).toEqual(['tools:abc', 'docs:dnew']);
  });

  it('without a base, combines both copies and warns', () => {
    const mine = clone(base);
    mine.collections[0].cards.push(card('x'));
    const theirs = clone(base);
    theirs.collections[0].cards = [card('a')];
    const r = mergeSpaces(undefined, mine, theirs);
    expect(ids(r.merged)).toEqual(['tools:abcx', 'docs:d']);
    expect(r.notes.join(' ')).toMatch(/no saved shared version/);
  });
});
