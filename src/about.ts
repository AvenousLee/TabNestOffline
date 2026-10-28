// About TabNest: shown in Settings → About, like the author's name on a book.
// Fill in the credit here; empty fields are simply not shown.

export const ABOUT = {
  /** Who created TabNest, e.g. "Avenous Lee". Empty: Settings shows a placeholder. */
  author: '',
  /** Optional line under the name, e.g. a company or role. */
  byline: '',
  /** Optional contact: an email address (becomes a mail link) or a web address. */
  contact: '',
  /** Source code. */
  repoUrl: 'https://github.com/AvenousLee/TabNestOffline',
  description: 'Organise tabs into spaces and collections, share them as offline files, sync them through Git, and keep your calendars in one place.',
};

/** Version of the installed extension (or "dev" in the localhost preview). */
export function appVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'dev';
  }
}
