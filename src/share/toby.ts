// Import from a Toby JSON export. Toby's format has changed over time, so this
// reads it loosely:
//   v3+: { groups: [ { name, lists: [ { title, cards: [ { title, url, customTitle, customDescription } ] } ] } ] }
//   v2 : { lists: [ { title, cards: [...] } ] }
//   also a bare array of lists.
// Each Toby group (space) becomes a TabNest space and each list a collection.

import type { Card, Collection, SharedSpace } from '../types';
import { SPACE_COLORS } from '../lib/colors';
import { newId, nowIso } from '../lib/util';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (...vals: unknown[]) => (vals.find((v) => typeof v === 'string' && v.trim()) as string | undefined)?.trim();
const arr = (o: Obj, ...keys: string[]) => (keys.map((k) => o[k]).find(Array.isArray) as unknown[] | undefined) ?? [];

const listsOf = (o: Obj) => arr(o, 'lists', 'collections');
const cardsOf = (o: Obj) => arr(o, 'cards', 'tabs', 'items', 'links');

export function looksLikeToby(data: unknown): boolean {
  if (Array.isArray(data)) return data.some((l) => isObj(l) && cardsOf(l).length > 0);
  if (!isObj(data) || data.format) return false;
  return Array.isArray(data.groups) || Array.isArray(data.spaces) || Array.isArray(data.lists);
}

function toCard(c: unknown): Card | null {
  if (!isObj(c)) return null;
  const url = str(c.url, c.href, c.link);
  if (!url) return null;
  const card: Card = { id: newId(), url, title: str(c.customTitle, c.title, c.name) ?? url };
  const note = str(c.customDescription, c.description, c.note);
  if (note) card.note = note;
  const icon = str(c.favIconUrl, c.favicon, c.icon);
  if (icon && /^https?:/i.test(icon)) card.favIconUrl = icon;
  return card;
}

function toCollection(l: unknown): Collection | null {
  if (!isObj(l)) return null;
  const cards = cardsOf(l).map(toCard).filter((c): c is Card => !!c);
  return { id: newId(), name: str(l.title, l.name) ?? 'Untitled', cards };
}

function toSpace(name: string, lists: unknown[], i: number): SharedSpace {
  return {
    format: 'tabnest.space',
    version: 1,
    id: '', // new space on import
    updatedAt: nowIso(),
    content: {
      name,
      color: SPACE_COLORS[i % SPACE_COLORS.length],
      collections: lists.map(toCollection).filter((c): c is Collection => !!c),
    },
  };
}

export function parseToby(data: unknown): SharedSpace[] {
  let spaces: SharedSpace[];
  if (Array.isArray(data)) spaces = [toSpace('Toby import', data, 0)];
  else {
    const o = data as Obj;
    const groups = arr(o, 'groups', 'spaces').filter(isObj);
    spaces = groups.length
      ? groups.map((g, i) => toSpace(str(g.name, g.title) ?? `Toby space ${i + 1}`, listsOf(g), i))
      : [toSpace('Toby import', listsOf(o), 0)];
  }
  spaces = spaces.filter((s) => s.content.collections.length > 0);
  if (!spaces.length) throw new Error('This looks like a Toby export, but no links were found in it.');
  return spaces;
}
