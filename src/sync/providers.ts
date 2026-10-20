// Reads and writes single files in a git repo through the host's REST API.
// Each write becomes a normal git commit, so history and rollback come for free.
//
// Supported hosts (detected automatically from the repository address):
//   GitHub          api.github.com   /repos/{owner}/{repo}/contents/{path}
//   Forgejo/Gitea   {server}/api/v1  /repos/{owner}/{repo}/contents/{path}   (same shape as GitHub)
//   GitLab          {server}/api/v4  /projects/{owner%2Frepo}/repository/files/{path%2F...}

import type { Remote, RemoteKind, SyncTarget } from '../types';
import { base64ToUtf8, newId, sha256, utf8ToBase64 } from '../lib/util';

export interface RemoteFile {
  /** Version id. Blob sha (GitHub/Forgejo), last commit id (GitLab), or content hash (plain URLs). */
  sha: string;
  text: string;
}

export class SyncError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export const KIND_NAMES: Record<RemoteKind, string> = { github: 'GitHub', forgejo: 'Forgejo', gitlab: 'GitLab' };

export function apiBase(remote: Pick<Remote, 'kind' | 'baseUrl'>): string {
  if (remote.kind === 'github') return 'https://api.github.com';
  return `${remote.baseUrl.replace(/\/+$/, '')}${remote.kind === 'gitlab' ? '/api/v4' : '/api/v1'}`;
}

/** Origin the extension needs permission for (self-hosted servers are requested at runtime). */
export function remoteOrigin(remote: Pick<Remote, 'kind' | 'baseUrl'>): string {
  return new URL(apiBase(remote)).origin;
}

const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const repoPath = (r: Remote) => `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`;
const projectId = (r: Remote) => encodeURIComponent(`${r.owner}/${r.repo}`);
const glFile = (r: Remote, path: string) => `${apiBase(r)}/projects/${projectId(r)}/repository/files/${encodeURIComponent(path.replace(/^\/+/, ''))}`;

function authHeaders(kind: RemoteKind, token: string): Record<string, string> {
  if (!token) return {};
  return kind === 'gitlab' ? { 'PRIVATE-TOKEN': token } : { Authorization: `token ${token}` };
}

function headers(remote: Remote): HeadersInit {
  return { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders(remote.kind, remote.token) };
}

async function failure(res: Response, what: string): Promise<SyncError> {
  let detail = '';
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown };
    detail = String(body.message ?? body.error ?? '');
  } catch {
    /* body wasn't JSON */
  }
  const hint =
    res.status === 401
      ? 'The token was rejected, expired or is missing. Click Update token.'
      : res.status === 403
        ? 'No permission. The token needs read access (and write access to upload).'
        : res.status === 404
          ? 'Repository, branch or file not found (or the token cannot see it).'
          : res.status === 400 || res.status === 409 || res.status === 422
            ? 'The file changed on the server at the same time. Check again.'
            : '';
  return new SyncError(`${what} failed (${res.status}). ${hint} ${detail}`.trim(), res.status);
}

async function request(input: string, init: RequestInit, what: string): Promise<Response> {
  try {
    return await fetch(input, { ...init, cache: 'no-store' });
  } catch {
    throw new SyncError(`${what} failed: could not reach the server. Check the address, your network or VPN.`);
  }
}

// ---------------------------------------------------------------- files

export async function getRepoFile(remote: Remote, path: string): Promise<RemoteFile | null> {
  if (remote.kind === 'gitlab') {
    const res = await request(`${glFile(remote, path)}?ref=${encodeURIComponent(remote.branch)}`, { headers: headers(remote) }, 'Reading from git');
    if (res.status === 404) return fileMissing(remote);
    if (!res.ok) throw await failure(res, 'Reading from git');
    const body = (await res.json()) as { content?: string; last_commit_id: string };
    return { sha: body.last_commit_id, text: base64ToUtf8(body.content ?? '') };
  }
  const url = `${apiBase(remote)}${repoPath(remote)}/contents/${encodePath(path)}?ref=${encodeURIComponent(remote.branch)}`;
  const res = await request(url, { headers: headers(remote) }, 'Reading from git');
  if (res.status === 404) return fileMissing(remote);
  if (!res.ok) throw await failure(res, 'Reading from git');
  const body = (await res.json()) as { sha: string; content?: string; type?: string };
  if (body.type && body.type !== 'file') throw new SyncError(`"${path}" in the repo is a folder, not a file.`);
  return { sha: body.sha, text: base64ToUtf8(body.content ?? '') };
}

/** A 404 for a file is fine ("not uploaded yet") as long as the repo itself is there. */
async function fileMissing(remote: Remote): Promise<null> {
  const info = await repoInfo(remote);
  if (info.status !== 'ok') throw new SyncError(`Cannot open ${remote.owner}/${remote.repo}. The token may have expired: click Update token.`);
  if (info.empty) return null;
  const url = `${branchesUrl(remote)}/${encodeURIComponent(remote.branch)}`;
  const res = await request(url, { headers: headers(remote) }, 'Checking the branch');
  if (res.ok) return null;
  // A brand-new repo has no branches at all until its first commit. That's fine:
  // the first upload creates the branch.
  const branches = await listBranches(remote);
  if (branches.length === 0) return null;
  throw new SyncError(`Branch "${remote.branch}" does not exist in ${remote.owner}/${remote.repo}. It has: ${branches.join(', ')}. Change it in Space settings → Change name or branch.`);
}

const branchesUrl = (remote: Remote) =>
  remote.kind === 'gitlab' ? `${apiBase(remote)}/projects/${projectId(remote)}/repository/branches` : `${apiBase(remote)}${repoPath(remote)}/branches`;

async function listBranches(remote: Remote): Promise<string[]> {
  const res = await request(`${branchesUrl(remote)}?per_page=20`, { headers: headers(remote) }, 'Listing branches');
  if (res.status === 404) return []; // some servers answer 404 for an empty repo
  if (!res.ok) throw await failure(res, 'Listing branches');
  return ((await res.json()) as Array<{ name: string }>).map((b) => b.name);
}

export async function putRepoFile(remote: Remote, path: string, text: string, sha: string | undefined, message: string): Promise<string> {
  const content = utf8ToBase64(text);
  if (remote.kind === 'gitlab') {
    const payload: Record<string, string> = { branch: remote.branch, content, encoding: 'base64', commit_message: message };
    if (sha) payload.last_commit_id = sha; // rejected if someone else changed the file meanwhile
    const res = await request(glFile(remote, path), { method: sha ? 'PUT' : 'POST', headers: headers(remote), body: JSON.stringify(payload) }, 'Saving to git');
    if (!res.ok) throw await failure(res, 'Saving to git');
    const after = await getRepoFile(remote, path); // GitLab doesn't return the new commit id
    if (!after) throw new SyncError('Saving to git: the file was not found after saving.');
    return after.sha;
  }
  const payload: Record<string, string> = { message, content, branch: remote.branch };
  if (sha) payload.sha = sha;
  // First file in a brand-new repo: there is no branch yet, so naming one fails.
  // Leaving it out makes the server create its default branch with this commit.
  else if ((await listBranches(remote)).length === 0) delete payload.branch;
  // Forgejo/Gitea create new files with POST; GitHub uses PUT for both.
  const method = remote.kind === 'forgejo' && !sha ? 'POST' : 'PUT';
  const res = await request(`${apiBase(remote)}${repoPath(remote)}/contents/${encodePath(path)}`, { method, headers: headers(remote), body: JSON.stringify(payload) }, 'Saving to git');
  if (!res.ok) throw await failure(res, 'Saving to git');
  const body = (await res.json()) as { content?: { sha?: string } };
  if (!body.content?.sha) throw new SyncError('Saving to git: the server did not return the new version.');
  return body.content.sha;
}

// ---------------------------------------------------------------- connecting

export interface RepoAddress {
  host: string;
  /** User or group. GitLab groups can be nested ("team/sub"). */
  owner: string;
  repo: string;
}

/**
 * Understand a repo address however it was copied:
 *   git@git.company.net:Owner/Repo.git      (SSH, also with "/" instead of ":")
 *   ssh://git@git.company.net:2222/Owner/Repo.git
 *   https://git.company.net/Owner/Repo(.git)  plus page paths like /src/..., /-/tree/..., /blob/...
 * Browsers can't speak SSH, so the same repo is reached over HTTPS on the same host.
 */
export function parseRepoAddress(input: string): RepoAddress | null {
  const s = input.trim().replace(/^\/+/, '');
  let m = s.match(/^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i);
  if (!m) m = s.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i);
  if (!m) m = s.match(/^[^@\s/]+@([^:/\s]+)[:/](.+)$/);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const rest = m[2]
    .replace(/[?#].*$/, '')
    .replace(/\/-\/.*$/, '') // GitLab pages: /-/tree/main, /-/blob/...
    .replace(/\/(src|tree|blob|raw|commits?|issues|pulls|wiki|settings)(\/.*)?$/i, '') // GitHub/Forgejo pages
    .replace(/\.git\/?$/i, '')
    .replace(/\/+$/, '');
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return { host, owner: parts.slice(0, -1).join('/'), repo: parts[parts.length - 1] };
}

/** Normal web address of a repo, for showing and editing. */
export function repoWebUrl(r: Remote): string {
  return r.kind === 'github' ? `https://github.com/${r.owner}/${r.repo}` : `${r.baseUrl}/${r.owner}/${r.repo}`;
}

async function looksLikeApi(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (![200, 401, 403].includes(res.status)) return false;
    return (res.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/** Work out which kind of server a host runs. Needs host permission first. */
export async function detectKind(host: string): Promise<RemoteKind> {
  if (host === 'github.com' || host === 'www.github.com') return 'github';
  if (host === 'gitlab.com') return 'gitlab';
  const base = `https://${host}`;
  if (await looksLikeApi(`${base}/api/v1/version`)) return 'forgejo';
  if (await looksLikeApi(`${base}/api/v4/version`)) return 'gitlab';
  try {
    await fetch(base, { cache: 'no-store' });
  } catch {
    throw new SyncError(`Could not reach ${host}. Check the address, and your network or VPN.`);
  }
  throw new SyncError(`${host} doesn't look like a GitHub, GitLab or Forgejo/Gitea server, which are the ones TabNest supports.`);
}

/** Where to create an access token on that server, and what to tick. */
export function tokenHelp(kind: RemoteKind, baseUrl: string): { url: string; text: string } {
  if (kind === 'github')
    return {
      url: 'https://github.com/settings/personal-access-tokens/new',
      text: 'Fine-grained token → choose this repository → Repository permissions → Contents: Read and write (Read-only is enough to follow).',
    };
  if (kind === 'gitlab')
    return { url: `${baseUrl}/-/user_settings/personal_access_tokens`, text: 'Add new token → tick “api” (or “read_api” to only follow).' };
  return { url: `${baseUrl}/user/settings/applications`, text: 'Generate new token → Repository: Read and write (Read is enough to follow).' };
}

interface RepoInfoOk {
  status: 'ok';
  fullName: string;
  isPrivate: boolean;
  canWrite: boolean;
  empty: boolean;
  defaultBranch: string;
}

async function repoInfo(remote: Remote): Promise<RepoInfoOk | { status: 'denied' | 'missing'; code: number }> {
  const url = remote.kind === 'gitlab' ? `${apiBase(remote)}/projects/${projectId(remote)}` : `${apiBase(remote)}${repoPath(remote)}`;
  const res = await request(url, { headers: headers(remote) }, 'Connecting');
  if (res.status === 401 || res.status === 403) return { status: 'denied', code: res.status };
  // Private repos look "missing" to someone who isn't signed in.
  if (res.status === 404) return { status: 'missing', code: 404 };
  if (!res.ok) throw await failure(res, 'Connecting');
  if (remote.kind === 'gitlab') {
    const b = (await res.json()) as {
      path_with_namespace?: string;
      visibility?: string;
      default_branch?: string | null;
      empty_repo?: boolean;
      permissions?: { project_access?: { access_level?: number } | null; group_access?: { access_level?: number } | null };
    };
    const level = Math.max(b.permissions?.project_access?.access_level ?? 0, b.permissions?.group_access?.access_level ?? 0);
    return {
      status: 'ok',
      fullName: b.path_with_namespace ?? `${remote.owner}/${remote.repo}`,
      isPrivate: b.visibility !== 'public',
      canWrite: level >= 30, // Developer or above
      empty: !!b.empty_repo,
      defaultBranch: b.default_branch || 'main',
    };
  }
  const b = (await res.json()) as { full_name?: string; private?: boolean; default_branch?: string; empty?: boolean; permissions?: { push?: boolean } };
  return {
    status: 'ok',
    fullName: b.full_name ?? `${remote.owner}/${remote.repo}`,
    isPrivate: !!b.private,
    canWrite: !!b.permissions?.push,
    empty: !!b.empty,
    defaultBranch: b.default_branch || 'main',
  };
}

export type ConnectResult =
  | { status: 'ok'; remote: Remote; message: string }
  | { status: 'needs-token'; kind: RemoteKind; baseUrl: string; message: string };

/**
 * One-step setup from just an address: detect the server, try without a
 * token, and only ask for one if the repo needs it. `existing` keeps the id
 * (and label) when reconnecting a remote.
 */
export async function connectRepo(address: string, token: string, opts: { branch?: string; existing?: Remote } = {}): Promise<ConnectResult> {
  const a = parseRepoAddress(address);
  if (!a) throw new SyncError('That doesn’t look like a repository address. Copy it from the repo page (the Clone button) and paste it here.');
  const kind = await detectKind(a.host);
  const baseUrl = kind === 'github' ? '' : `https://${a.host}`;
  const draft: Remote = {
    id: opts.existing?.id ?? newId(),
    label: opts.existing?.label || a.repo,
    kind,
    baseUrl,
    owner: a.owner,
    repo: a.repo,
    branch: opts.branch?.trim() || 'main',
    token: token.trim(),
  };
  const where = kind === 'github' ? 'GitHub' : `${a.host} (${KIND_NAMES[kind]})`;
  const info = await repoInfo(draft);
  if (info.status !== 'ok') {
    if (!draft.token) {
      return {
        status: 'needs-token',
        kind,
        baseUrl: kind === 'github' ? 'https://github.com' : baseUrl,
        message: `${a.owner}/${a.repo} on ${where} needs you to sign in (or the address has a typo). Paste an access token to connect.`,
      };
    }
    throw new SyncError(
      info.status === 'denied'
        ? `The token was not accepted by ${where} (${info.code}). Check that it was copied fully and hasn't expired.`
        : `${a.owner}/${a.repo} was not found on ${where}, or this token can't see it. Check the address, or ask the owner to give you access.`,
    );
  }
  draft.branch = opts.branch?.trim() || info.defaultBranch;
  const access = info.canWrite ? 'you can upload changes' : draft.token ? 'read-only for you (you can follow spaces here)' : 'readable without signing in (add a token to upload)';
  const notes = [`Connected to ${info.fullName} on ${where}: ${info.isPrivate ? 'private' : 'public'}, ${access}, branch ${draft.branch}.`];
  if (info.empty) notes.push('The repository is empty. TabNest will try to create the first file; if that fails, add a README in the repo first.');
  return { status: 'ok', remote: { ...draft, readOnly: !info.canWrite }, message: notes.join(' ') };
}

// ---------------------------------------------------------------- links

/**
 * A link that serves the raw file, for "check for updates" in shared HTML files.
 * Only works for readers who can reach it without signing in.
 */
export function rawFileUrl(remote: Remote, path: string): string {
  if (remote.kind === 'github') return `https://raw.githubusercontent.com/${remote.owner}/${remote.repo}/${encodeURIComponent(remote.branch)}/${encodePath(path)}`;
  if (remote.kind === 'gitlab') return `${glFile(remote, path)}/raw?ref=${encodeURIComponent(remote.branch)}`;
  // Forgejo's API route (not the web /raw/ page), so the server's [cors] setting applies to it.
  return `${apiBase(remote)}${repoPath(remote)}/raw/${encodePath(path)}?ref=${encodeURIComponent(remote.branch)}`;
}

/** Web page showing the file (readers sign in there as usual). */
export function sourcePageUrl(remote: Remote, path: string): string {
  const p = encodePath(path);
  const b = encodeURIComponent(remote.branch);
  if (remote.kind === 'github') return `https://github.com/${remote.owner}/${remote.repo}/blob/${b}/${p}`;
  if (remote.kind === 'gitlab') return `${remote.baseUrl}/${remote.owner}/${remote.repo}/-/blob/${b}/${p}`;
  return `${remote.baseUrl}/${remote.owner}/${remote.repo}/src/branch/${b}/${p}`;
}

/**
 * If a shared file's update link points into a repo you already have a remote
 * for (same server + owner + repo), return that remote and the file path, so the
 * space can be followed with your own token.
 */
export function matchRemoteForUrl(url: string, remotes: Remote[]): { remote: Remote; path: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  for (const r of remotes) {
    if (!r.token) continue;
    if (r.kind === 'gitlab') {
      const prefix = `${new URL(apiBase(r)).pathname}/projects/${projectId(r)}/repository/files/`;
      if (u.origin !== remoteOrigin(r) || !u.pathname.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      const path = decodeURIComponent(u.pathname.slice(prefix.length).replace(/\/raw$/, ''));
      if (path) return { remote: r, path };
      continue;
    }
    const api = new URL(apiBase(r));
    const prefix = r.kind === 'github' ? `/${r.owner}/${r.repo}/` : `${api.pathname}/repos/${r.owner}/${r.repo}/raw/`;
    const sameHost = r.kind === 'github' ? u.host === 'raw.githubusercontent.com' : u.origin === api.origin;
    const p = decodeURIComponent(u.pathname);
    if (!sameHost || !p.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    let path = p.slice(prefix.length);
    if (r.kind === 'github') path = path.split('/').slice(1).join('/'); // drop the branch segment
    if (path) return { remote: r, path };
  }
  return null;
}

/** Fetch whatever the sync target points at. */
export async function fetchTarget(target: SyncTarget, remotes: Remote[]): Promise<RemoteFile | null> {
  if (target.type === 'repo') return getRepoFile(findRemote(target.remoteId, remotes), target.path);
  // Following a shared link on a private server: use the token of a remote on the same server, if there is one.
  const origin = new URL(target.url).origin;
  const remote = remotes.find((r) => r.token && remoteOrigin(r) === origin);
  const res = await request(target.url, { headers: remote ? authHeaders(remote.kind, remote.token) : {} }, 'Checking for updates');
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new SyncError(
      remote
        ? `No access to the shared space (${res.status}). Your token for ${remote.label} cannot read it. Ask the owner for access or for a new file.`
        : `The shared space needs a login (${res.status}). Connect that repository in Git repositories, or ask the owner for a new file.`,
      res.status,
    );
  }
  if (!res.ok) throw await failure(res, 'Checking for updates');
  const text = await res.text();
  return { sha: await sha256(text), text };
}

export function findRemote(id: string, remotes: Remote[]): Remote {
  const r = remotes.find((x) => x.id === id);
  if (!r) throw new SyncError('The repository for this space was removed. Pick or connect one in Space settings.');
  return r;
}
