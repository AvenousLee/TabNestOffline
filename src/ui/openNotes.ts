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

// Unsaved changes to a locked description, kept when the editor locks itself after a while
// without use. Encrypted with the same password (lib/lock.ts), in memory only, until saved or discarded.
export interface NoteDraft {
  /** The saved lock the changes were made to; a draft for an older version is dropped. */
  basedOn: string;
  draftLock: string;
}

const drafts = new Map<string, NoteDraft>();

export function getDraft(cardId: string, lock: string | undefined): NoteDraft | undefined {
  const d = drafts.get(cardId);
  if (d && d.basedOn !== lock) drafts.delete(cardId);
  return d && d.basedOn === lock ? d : undefined;
}

export function setDraft(cardId: string, draft: NoteDraft): void {
  drafts.set(cardId, draft);
}

export function dropDraft(cardId: string): void {
  drafts.delete(cardId);
}
