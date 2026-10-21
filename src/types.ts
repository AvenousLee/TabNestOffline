// Core data model. A Space holds Collections, a Collection holds Cards (saved links).

export interface Card {
  id: string;
  title: string;
  url: string;
  note?: string;
  favIconUrl?: string;
  /** Picture shown on the card: an uploaded image (data: URL, kept small) or a web image link. */
  image?: string;
}

/** Longest description a card can have. */
export const NOTE_MAX = 500;

export interface Collection {
  id: string;
  name: string;
  cards: Card[];
  collapsed?: boolean;
}

/** Content of a space: what gets shared and synced. No settings or secrets. */
export interface SpaceContent {
  name: string;
  color: string;
  collections: Collection[];
}

export type UpdatePolicy = 'auto' | 'ask' | 'ignore';

/** Where a space syncs to. */
export type SyncTarget =
  /**
   * A file in a GitHub / Forgejo repo, using one of the configured remotes.
   * follow = pull only: someone else's space you subscribe to; your edits stay on this device.
   */
  | { type: 'repo'; remoteId: string; path: string; follow?: boolean }
  /** A plain URL to a space file, e.g. a public raw git link someone shared (read only). */
  | { type: 'url'; url: string };

export interface SyncConfig {
  target: SyncTarget;
  /** What to do when the remote copy changes. */
  policy: UpdatePolicy;
  /** Push local edits automatically (repo targets only). */
  autoPush: boolean;
  /**
   * The last version both sides agreed on. Undefined until the first sync.
   * sha is '' for a space imported from a shared file (content known, server version not yet).
   */
  base?: { sha: string; hash: string; /** That version's content, kept locally so both sides' edits can be merged. */ content?: SpaceContent };
  /** Remote version the user chose to ignore; we don't prompt again until it changes. */
  ignoredSha?: string;
  lastCheckedAt?: string;
  lastError?: string;
  /** The file at the sync path exists but isn't a TabNest space (its version id), so it can be replaced on request. */
  badFileSha?: string;
}

/** How a space behaves when exported as an offline HTML file. */
export interface ShareSettings {
  /** snapshot = frozen copy; check = the file looks for a newer version when opened. */
  mode: 'snapshot' | 'check';
  /** URL the HTML file checks. Empty = derive from the sync target if possible. */
  checkUrl?: string;
}

export interface Space extends SpaceContent {
  id: string;
  /** Bumped on every content change. Used by shared HTML files to tell which copy is newer. */
  updatedAt: string;
  sync?: SyncConfig;
  share: ShareSettings;
  /** Who originally shared this space. Kept when it's imported, re-shared or synced, so readers can reach them. */
  owner?: Profile;
}

export type RemoteKind = 'github' | 'forgejo' | 'gitlab';

/** A git account + repo to sync spaces into. Several spaces can share one remote (different paths). */
export interface Remote {
  id: string;
  label: string;
  kind: RemoteKind;
  /** Self-hosted server, e.g. https://git.mycompany.com. Empty for GitHub. */
  baseUrl: string;
  owner: string;
  repo: string;
  branch: string;
  /** Personal access token (empty for public repos). Stored only in this browser's local extension storage. */
  token: string;
  /** Found at connect time: you can read but not upload (fine for following). */
  readOnly?: boolean;
}

/** A remote change waiting for the user to decide. */
export interface PendingUpdate {
  spaceId: string;
  kind: 'remote-update' | 'conflict';
  sha: string;
  remote: SpaceFile;
}

/** The JSON file written to git (one file per space). */
export interface SpaceFile {
  format: 'tabnest.space';
  version: 1;
  id: string;
  updatedAt: string;
  content: SpaceContent;
  /** Original owner (name + contact). */
  owner?: Profile;
}

/** Personal preferences (this browser only, not synced). */
export interface Prefs {
  /** Fetch each saved link's website preview picture automatically. */
  autoPreview: boolean;
}

/** Who is sharing. Shown in shared files so readers know whom to ask for a newer copy. */
export interface Profile {
  name: string;
  /** Email (makes an "email the owner" link) or any text, e.g. a Teams name. */
  contact: string;
}

/** One space inside a shared file. */
export type SharedSpace = SpaceFile & {
  /** Machine-readable link the file checks for a newer version. */
  checkUrl?: string;
  /** Web page of the file on Forgejo/GitHub, for readers who can sign in there. */
  sourceUrl?: string;
};

/** Payload embedded in a shared HTML file. */
export interface ShareBundle {
  format: 'tabnest.share';
  version: 1;
  exportedAt: string;
  sharedBy?: Profile;
  spaces: SharedSpace[];
}
