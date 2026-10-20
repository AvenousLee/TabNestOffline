// Three-way merge of two edited copies of a space, using the version both
// last agreed on ("base"). Collections and cards have stable ids, so we can
// tell what each side added, deleted, edited or moved:
//   - added on either side      -> kept
//   - deleted on either side    -> deleted (unless the other side edited it: then kept, and noted)
//   - edited on one side        -> that edit wins
//   - edited on both, same field, different values -> "mine" wins, and noted
//   - moved to another collection on one side -> moved
// Without a base (older spaces), both copies are combined; deletions can't be
// detected, so deleted items may come back.

import type { Card, Collection, SpaceContent } from '../types';

export interface MergeResult {
  merged: SpaceContent;
  /** Plain-English notes about clashes, for the user. */
  notes: string[];
  /** True when nothing clashed (safe to merge without asking). */
  clean: boolean;
}

const CARD_FIELDS = ['title', 'url', 'note', 'image', 'favIconUrl'] as const;
const eq = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');

/** Pick a field value: whichever side changed it wins; both changed differently -> mine (reported). */
function pick<T>(base: T | undefined, mine: T, theirs: T, onClash: () => void, hasBase: boolean): T {
  if (eq(mine, theirs)) return mine;
  if (hasBase && eq(mine, base)) return theirs; // only they changed it
  if (hasBase && eq(theirs, base)) return mine; // only I changed it
  onClash();
  return mine;
}

/** Order ids: start from theirs, then slot in my new ids after the item that precedes them in mine. */
function mergeOrder(mineIds: string[], theirIds: string[], keep: Set<string>): string[] {
  const out = theirIds.filter((id) => keep.has(id));
  mineIds.forEach((id, i) => {
    if (!keep.has(id) || out.includes(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = out.indexOf(mineIds[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

const cardChanged = (a: Card, b: Card | undefined) => !b || CARD_FIELDS.some((f) => !eq(a[f], b[f]));

export function mergeSpaces(base: SpaceContent | undefined, mine: SpaceContent, theirs: SpaceContent): MergeResult {
  const notes: string[] = [];
  const hasBase = !!base;
  const clash = (what: string) => () => notes.push(what);

  // --- collections (by id)
  const index = (s: SpaceContent | undefined) => new Map((s?.collections ?? []).map((c) => [c.id, c]));
  const bCols = index(base);
  const mCols = index(mine);
  const tCols = index(theirs);

  const keepCols = new Set<string>();
  // Deleted on one side but kept because the other side changed it: its cards come back too.
  const revivedCols = new Set<string>();
  for (const id of new Set([...mCols.keys(), ...tCols.keys()])) {
    const m = mCols.get(id);
    const t = tCols.get(id);
    const b = bCols.get(id);
    if (m && t) keepCols.add(id);
    else if (!hasBase || !b) keepCols.add(id); // new on one side (or no base to tell)
    else {
      // Deleted on one side. Keep it only if the other side changed it since base.
      const survivor = (m ?? t)!;
      const changed = survivor.name !== b.name || JSON.stringify(survivor.cards) !== JSON.stringify(b.cards);
      if (changed) {
        keepCols.add(id);
        revivedCols.add(id);
        notes.push(`Collection “${survivor.name}” was deleted on ${m ? 'the other side' : 'this device'} but changed on ${m ? 'this device' : 'the other side'}, so it was kept.`);
      }
    }
  }

  // --- cards: decide where each card ends up (handles moves between collections)
  type Loc = { col: string; card: Card };
  const locate = (s: SpaceContent | undefined) => {
    const map = new Map<string, Loc>();
    for (const c of s?.collections ?? []) for (const k of c.cards) map.set(k.id, { col: c.id, card: k });
    return map;
  };
  const bCards = locate(base);
  const mCards = locate(mine);
  const tCards = locate(theirs);
  const finalCards = new Map<string, Loc>();

  for (const id of new Set([...mCards.keys(), ...tCards.keys()])) {
    const m = mCards.get(id);
    const t = tCards.get(id);
    const b = bCards.get(id);
    if (m && t) {
      const card = { id } as Card;
      for (const f of CARD_FIELDS) {
        const v = pick(b?.card[f], m.card[f], t.card[f], clash(`“${m.card.title}”: ${f === 'favIconUrl' ? 'icon' : f} was changed on both sides; kept this device's version.`), hasBase);
        if (v !== undefined && v !== '') (card as unknown as Record<string, unknown>)[f] = v;
      }
      if (!card.title) card.title = card.url;
      // Moved: the side whose location differs from base wins; both moved -> mine.
      const col = m.col === t.col ? m.col : hasBase && b && m.col === b.col ? t.col : m.col;
      finalCards.set(id, { col, card });
    } else {
      const only = (m ?? t)!;
      if (!hasBase || !b) finalCards.set(id, only); // added on one side
      else if (revivedCols.has(b.col) && only.col === b.col) finalCards.set(id, only); // its collection was kept
      else if (cardChanged(only.card, b.card)) {
        finalCards.set(id, only);
        notes.push(`“${only.card.title}” was removed on ${m ? 'the other side' : 'this device'} but edited on ${m ? 'this device' : 'the other side'}, so it was kept.`);
      }
      // else: deleted on one side and untouched on the other -> stays deleted
    }
  }

  // A card whose collection was deleted moves to the first remaining collection.
  const colOrder = mergeOrder([...mCols.keys()], [...tCols.keys()], keepCols);
  for (const [id, loc] of finalCards) {
    if (!keepCols.has(loc.col)) {
      if (!colOrder.length) {
        finalCards.delete(id);
        continue;
      }
      finalCards.set(id, { ...loc, col: colOrder[0] });
    }
  }

  const collections: Collection[] = colOrder.map((cid) => {
    const m = mCols.get(cid);
    const t = tCols.get(cid);
    const b = bCols.get(cid);
    const name = m && t ? pick(b?.name, m.name, t.name, clash(`Collection “${m.name}” was renamed on both sides; kept “${m.name}”.`), hasBase) : (m ?? t)!.name;
    const ids = [...finalCards].filter(([, l]) => l.col === cid).map(([id]) => id);
    const keep = new Set(ids);
    const order = mergeOrder(m?.cards.map((k) => k.id) ?? [], t?.cards.map((k) => k.id) ?? [], keep);
    for (const id of ids) if (!order.includes(id)) order.push(id); // moved in from another collection
    return { id: cid, name, cards: order.map((id) => finalCards.get(id)!.card) };
  });

  const name = pick(base?.name, mine.name, theirs.name, clash(`The space was renamed on both sides; kept “${mine.name}”.`), hasBase);
  const color = pick(base?.color, mine.color, theirs.color, () => {}, hasBase);
  if (!hasBase) notes.push('This space had no saved shared version yet, so both copies were combined. Anything deleted on one side may have come back.');

  return { merged: { name, color, collections }, notes, clean: notes.length === 0 };
}
