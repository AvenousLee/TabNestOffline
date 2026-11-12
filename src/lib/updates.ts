// "Check for updates" in Settings → About TabNest.
//
// An extension can't replace its own files, so a copy loaded with "Load unpacked"
// can't update itself (store installs update automatically). This only finds the
// latest release the developer published on GitHub and gives its download; the user
// unzips it over the TabNest folder and presses Reload.
//
// A release = a GitHub release tagged like "v0.2.0" with the built zip attached
// (made by `npm run release`, see README → Releasing a new version).

import { ABOUT } from '../about';

export interface Release {
  version: string;
  /** The release's page on GitHub (notes, all files). */
  pageUrl: string;
  /** The built extension zip attached to the release, if any. */
  zipUrl?: string;
  notes: string;
  publishedAt?: string;
}

/** "owner/repo" from the repository address in about.ts. */
export function repoOf(url: string = ABOUT.repoUrl): string {
  const m = /github\.com\/([^/]+\/[^/#?]+)/.exec(url);
  if (!m) throw new Error('The source code address is not a GitHub repository.');
  return m[1].replace(/\.git$/, '');
}

/** Compare "1.2.10" with "1.2.9" (also "v1.2", "1.2.0-beta"): negative, 0 or positive. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body?: string;
  published_at?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

export function releaseFrom(gh: GitHubRelease): Release {
  const zip = gh.assets?.find((a) => /\.zip$/i.test(a.name));
  return { version: gh.tag_name.replace(/^v/i, ''), pageUrl: gh.html_url, zipUrl: zip?.browser_download_url, notes: (gh.body ?? '').trim(), publishedAt: gh.published_at };
}

/** The latest published release, or null if the developer hasn't published one yet. */
export async function latestRelease(repo = repoOf()): Promise<Release | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    throw new Error('Could not reach GitHub. Check your network / VPN.');
  }
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a few minutes.');
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  return releaseFrom((await res.json()) as GitHubRelease);
}
