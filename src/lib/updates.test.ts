import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareVersions, latestRelease, releaseFrom, repoOf } from './updates';

describe('checking for updates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('compares versions number by number', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('finds the repository from its address', () => {
    expect(repoOf('https://github.com/AvenousLee/TabNestOffline')).toBe('AvenousLee/TabNestOffline');
    expect(repoOf('https://github.com/a/b.git')).toBe('a/b');
    expect(() => repoOf('https://gitlab.com/a/b')).toThrow(/GitHub/);
  });

  it('reads a GitHub release and its zip', () => {
    const r = releaseFrom({
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/a/b/releases/tag/v0.2.0',
      body: ' Calendar and more \n',
      assets: [{ name: 'source.tar.gz', browser_download_url: 'x' }, { name: 'TabNest-v0.2.0.zip', browser_download_url: 'https://github.com/a/b/releases/download/v0.2.0/TabNest-v0.2.0.zip' }],
    });
    expect(r).toMatchObject({ version: '0.2.0', notes: 'Calendar and more', zipUrl: 'https://github.com/a/b/releases/download/v0.2.0/TabNest-v0.2.0.zip' });
  });

  it('says when no release has been published yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await latestRelease('a/b')).toBeNull();
  });
});
