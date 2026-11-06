// Locked descriptions that are open right now on a card, so its editor can show
// the text without asking for the password again. Kept in memory only, and only
// while the card shows it: locking it again, auto-hide, or leaving the space ends it.

export interface OpenNote {
  /** The lock this text belongs to (a changed lock means a different description). */
  lock: string;
  text: string;
  password: string;
}

const open = new Map<string, OpenNote>();

export function getOpenNote(cardId: string, lock: string | undefined): OpenNote | undefined {
  const o = open.get(cardId);
  return o && lock && o.lock === lock ? o : undefined;
}

export function setOpenNote(cardId: string, note: OpenNote): void {
  open.set(cardId, note);
}

/** Forget it, unless it was replaced meanwhile by a newer lock (e.g. the editor saved a change). */
export function closeOpenNote(cardId: string, lock: string | undefined): void {
  if (open.get(cardId)?.lock === lock) open.delete(cardId);
}
