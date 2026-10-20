// Native HTML5 drag & drop payloads shared by cards, collections, spaces and open tabs.
import type { DragEvent } from 'react';

export type DragItem =
  | { kind: 'card'; spaceId: string; colId: string; cardId: string }
  | { kind: 'tab'; title: string; url: string; favIconUrl?: string }
  | { kind: 'collection'; spaceId: string; colId: string }
  | { kind: 'space'; spaceId: string };

const MIME = 'application/x-tabnest';

// dragover handlers can't read the payload, only its type, so keep a copy here.
let current: DragItem | null = null;

export function startDrag(e: DragEvent, item: DragItem, url?: string) {
  current = item;
  e.dataTransfer.setData(MIME, JSON.stringify(item));
  // Also expose the link, so cards can be dropped into other apps or the address bar.
  if (url) {
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
  }
  e.dataTransfer.effectAllowed = 'copyMove';
}

export function endDrag() {
  current = null;
}

export const draggingKind = () => current?.kind;

/** Accept our own items, or links dragged in from other pages / the address bar. */
export function acceptsDrop(e: DragEvent, kinds: DragItem['kind'][]): boolean {
  if (current) return kinds.includes(current.kind);
  return kinds.includes('tab') && e.dataTransfer.types.includes('text/uri-list');
}

export function readDrop(e: DragEvent): DragItem | null {
  const raw = e.dataTransfer.getData(MIME);
  if (raw) {
    try {
      return JSON.parse(raw) as DragItem;
    } catch {
      return null;
    }
  }
  const url = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#'));
  if (url && /^https?:/i.test(url)) return { kind: 'tab', title: url, url: url.trim() };
  return null;
}

/** Index to insert at, based on where the pointer is over a list of card elements. */
export function dropIndex(e: DragEvent, container: HTMLElement, selector: string): number {
  const items = [...container.querySelectorAll<HTMLElement>(selector)];
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    const sameRow = e.clientY >= r.top && e.clientY <= r.bottom;
    if ((sameRow && e.clientX < r.left + r.width / 2) || e.clientY < r.top) return i;
  }
  return items.length;
}
