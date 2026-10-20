import type { Card, Collection, Space, SpaceContent, SpaceFile } from '../types';
import { newId, sha256 } from './util';

/** Strip UI-only fields (like collapsed) so they don't count as content changes. */
export function contentOf(space: SpaceContent): SpaceContent {
  return {
    name: space.name,
    color: space.color,
    collections: space.collections.map(
      (c): Collection => ({
        id: c.id,
        name: c.name,
        cards: c.cards.map((k): Card => {
          const card: Card = { id: k.id, title: k.title, url: k.url };
          if (k.note) card.note = k.note;
          if (k.favIconUrl) card.favIconUrl = k.favIconUrl;
          if (k.image && isSafeImage(k.image)) card.image = k.image;
          return card;
        }),
      }),
    ),
  };
}

/** Only real images: small uploaded pictures (data:image/...) or web links. Anything else is dropped. */
export const isSafeImage = (src: string) => /^data:image\/(png|jpeg|webp|gif);base64,/i.test(src) || /^https?:\/\//i.test(src);

/** Stable hash of a space's content, used to detect local edits since the last sync. */
export const hashContent = (space: SpaceContent): Promise<string> => sha256(JSON.stringify(contentOf(space)));

export function toSpaceFile(space: Space): SpaceFile {
  return { format: 'tabnest.space', version: 1, id: space.id, updatedAt: space.updatedAt, content: contentOf(space) };
}

export const serializeSpaceFile = (file: SpaceFile): string => JSON.stringify(file, null, 2) + '\n';

/** Parse and validate a space file. Throws a readable error if it isn't one. */
export function parseSpaceFile(text: string): SpaceFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  return validateSpaceFile(data);
}

export function validateSpaceFile(data: unknown): SpaceFile {
  const f = data as Partial<SpaceFile>;
  if (!f || f.format !== 'tabnest.space') throw new Error('This is not a TabNest space file.');
  if (f.version !== 1) throw new Error(`Unsupported space file version ${String(f.version)}.`);
  const c = f.content as Partial<SpaceContent> | undefined;
  if (!c || typeof c.name !== 'string' || !Array.isArray(c.collections)) throw new Error('Space file is missing its content.');
  for (const col of c.collections) {
    if (!col || typeof col.id !== 'string' || !Array.isArray(col.cards)) throw new Error('Space file has a broken collection.');
    for (const card of col.cards) {
      if (!card || typeof card.url !== 'string') throw new Error('Space file has a broken link.');
    }
  }
  return {
    format: 'tabnest.space',
    version: 1,
    id: String(f.id ?? ''),
    updatedAt: String(f.updatedAt ?? new Date(0).toISOString()),
    content: contentOf({
      name: c.name,
      color: typeof c.color === 'string' ? c.color : '#d64c78',
      collections: c.collections.map((col) => ({
        id: col.id,
        name: String(col.name ?? 'Untitled'),
        cards: col.cards.map((k) => ({ ...k, id: String(k.id || newId()), title: String(k.title || k.url) })),
      })),
    }),
  };
}
