import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Remote } from '../types';
import { connectRepo, matchRemoteForUrl, parseRepoAddress, rawFileUrl } from './providers';

describe('parseRepoAddress', () => {
  const want = { host: 'git.sophicauto.net', owner: 'Avenous', repo: 'TabNest_TestingPage1' };
  it.each([
    'git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git',
    '/git@git.sophicauto.net/Avenous/TabNest_TestingPage1.git',
    'ssh://git@git.sophicauto.net:2222/Avenous/TabNest_TestingPage1.git',
    'https://git.sophicauto.net/Avenous/TabNest_TestingPage1.git',
    'https://git.sophicauto.net/Avenous/TabNest_TestingPage1',
    'https://git.sophicauto.net/Avenous/TabNest_TestingPage1/src/branch/main/space.json',
  ])('reads %s', (addr) => {
    expect(parseRepoAddress(addr)).toEqual(want);
  });
  it('reads GitHub and nested GitLab groups', () => {
    expect(parseRepoAddress('git@github.com:me/spaces.git')).toEqual({ host: 'github.com', owner: 'me', repo: 'spaces' });
    expect(parseRepoAddress('https://gitlab.com/team/sub/spaces/-/tree/main')).toEqual({ host: 'gitlab.com', owner: 'team/sub', repo: 'spaces' });
  });
  it('rejects junk', () => {
    expect(parseRepoAddress('hello')).toBeNull();
    expect(parseRepoAddress('https://github.com/onlyowner')).toBeNull();
  });
});

describe('matchRemoteForUrl', () => {
  const forgejo: Remote = { id: 'f', label: 'Work', kind: 'forgejo', baseUrl: 'https://git.sophicauto.net', owner: 'Avenous', repo: 'TabNest_TestingPage1', branch: 'main', token: 't' };
  const github: Remote = { id: 'g', label: 'Me', kind: 'github', baseUrl: '', owner: 'me', repo: 'spaces', branch: 'main', token: 't' };
  const gitlab: Remote = { id: 'l', label: 'GL', kind: 'gitlab', baseUrl: 'https://gitlab.example', owner: 'team/sub', repo: 'spaces', branch: 'main', token: 't' };
  it('finds the remote and path behind a shared update link', () => {
    expect(matchRemoteForUrl(rawFileUrl(forgejo, 'spaces/si work.json'), [github, forgejo])).toEqual({ remote: forgejo, path: 'spaces/si work.json' });
    expect(matchRemoteForUrl(rawFileUrl(github, 'space.json'), [forgejo, github])).toEqual({ remote: github, path: 'space.json' });
    expect(matchRemoteForUrl(rawFileUrl(gitlab, 'spaces/a.json'), [gitlab])).toEqual({ remote: gitlab, path: 'spaces/a.json' });
  });
  it('ignores other repos and remotes without a token', () => {
    expect(matchRemoteForUrl('https://git.sophicauto.net/api/v1/repos/Other/repo/raw/a.json', [forgejo])).toBeNull();
    expect(matchRemoteForUrl(rawFileUrl(forgejo, 'a.json'), [{ ...forgejo, token: '' }])).toBeNull();
  });
});

describe('connectRepo', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Fake server: routes are "METHOD url-prefix" → [status, body]; auth decides per call. */
  function server(routes: (url: string, headers: Record<string, string>) => [number, unknown] | undefined) {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const r = routes(url, (init?.headers ?? {}) as Record<string, string>);
      if (!r) return new Response('<html></html>', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'content-type': 'application/json' } });
    });
  }

  it('Forgejo that requires sign-in: asks for a token, then connects with it', async () => {
    server((url, h) => {
      const signedIn = h.Authorization === 'token good';
      if (url.endsWith('/api/v1/version')) return signedIn ? [200, { version: '9' }] : [403, { message: 'Only signed in user is allowed to call APIs.' }];
      if (url.endsWith('/api/v1/repos/Avenous/TabNest_TestingPage1'))
        return signedIn ? [200, { full_name: 'Avenous/TabNest_TestingPage1', private: true, default_branch: 'main', permissions: { push: true } }] : [403, { message: 'no' }];
      return undefined;
    });
    const first = await connectRepo('git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git', '');
    expect(first.status).toBe('needs-token');
    const second = await connectRepo('git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git', 'good');
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.remote).toMatchObject({ kind: 'forgejo', baseUrl: 'https://git.sophicauto.net', branch: 'main', readOnly: false, token: 'good' });
    expect(second.message).toMatch(/private, you can upload/);
    await expect(connectRepo('git@git.sophicauto.net:Avenous/TabNest_TestingPage1.git', 'bad')).rejects.toThrow(/not accepted/);
  });

  it('public GitHub repo connects without a token (read-only) and uses its default branch', async () => {
    server((url) => (url === 'https://api.github.com/repos/me/spaces' ? [200, { full_name: 'me/spaces', private: false, default_branch: 'trunk' }] : undefined));
    const res = await connectRepo('https://github.com/me/spaces', '');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.remote).toMatchObject({ kind: 'github', branch: 'trunk', readOnly: true });
  });

  it('detects a self-hosted GitLab', async () => {
    server((url) => {
      if (url.endsWith('/api/v4/version')) return [401, { message: '401 Unauthorized' }];
      if (url.includes('/api/v4/projects/team%2Fspaces'))
        return [200, { path_with_namespace: 'team/spaces', visibility: 'private', default_branch: 'main', permissions: { project_access: { access_level: 40 } } }];
      return undefined;
    });
    const res = await connectRepo('git@gitlab.corp.test:team/spaces.git', 'tok');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.remote).toMatchObject({ kind: 'gitlab', readOnly: false });
  });

  it('explains servers it does not support', async () => {
    server((url) => (url === 'https://bitbucket.example' ? [200, {}] : undefined));
    await expect(connectRepo('git@bitbucket.example:a/b.git', '')).rejects.toThrow(/doesn't look like/);
  });
});

describe('brand-new empty repository', () => {
  afterEach(() => vi.unstubAllGlobals());
  const gh: Remote = { id: 'g', label: 'Me', kind: 'github', baseUrl: '', owner: 'me', repo: 'fresh', branch: 'main', token: 't' };

  it('treats the missing file as "not uploaded yet", and the first upload creates the branch', async () => {
    const calls: Array<{ url: string; method: string; body?: Record<string, string> }> = [];
    let created = false;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
      if (method === 'PUT') {
        created = true;
        return json(201, { content: { sha: 'abc' } });
      }
      if (url.includes('/contents/')) return json(404, { message: 'This repository is empty.' });
      if (url === 'https://api.github.com/repos/me/fresh') return json(200, { full_name: 'me/fresh', default_branch: 'main', permissions: { push: true } });
      if (url.includes('/branches/main')) return json(404, { message: 'Branch not found' });
      if (url.includes('/branches?')) return json(200, created ? [{ name: 'main' }] : []);
      return json(404, {});
    });
    const { getRepoFile, putRepoFile } = await import('./providers');
    expect(await getRepoFile(gh, 'space.json')).toBeNull();
    expect(await putRepoFile(gh, 'space.json', '{}', undefined, 'first')).toBe('abc');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.body).not.toHaveProperty('branch');
  });

  it('still reports a genuinely wrong branch', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
      if (url.includes('/contents/')) return json(404, {});
      if (url === 'https://api.github.com/repos/me/fresh') return json(200, { full_name: 'me/fresh', default_branch: 'master' });
      if (url.includes('/branches/main')) return json(404, {});
      if (url.includes('/branches?')) return json(200, [{ name: 'master' }]);
      return json(404, {});
    });
    const { getRepoFile } = await import('./providers');
    await expect(getRepoFile(gh, 'space.json')).rejects.toThrow(/It has: master/);
  });
});

describe('GitHub fine-grained token without write permission', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('explains how to fix the token instead of a generic 403', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403, headers: { 'content-type': 'application/json' } }),
    );
    const { putRepoFile } = await import('./providers');
    const gh: Remote = { id: 'g', label: 'x', kind: 'github', baseUrl: '', owner: 'me', repo: 'r', branch: 'main', token: 't' };
    await expect(putRepoFile(gh, 'space.json', '{}', 'sha', 'msg')).rejects.toThrow(/Contents to "Read and write"/);
  });
});

describe('GitHub files over 1 MB', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads the content through the blob API', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/git/blobs/big')) return json({ content: btoa('{"big":true}') });
      return json({ sha: 'big', type: 'file', content: '', encoding: 'none', size: 2_000_000 });
    });
    const { getRepoFile } = await import('./providers');
    const gh: Remote = { id: 'g', label: 'x', kind: 'github', baseUrl: '', owner: 'me', repo: 'r', branch: 'main', token: 't' };
    expect(await getRepoFile(gh, 'space.json')).toEqual({ sha: 'big', text: '{"big":true}' });
  });
});

describe('sync path that is a folder', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('explains it instead of "not valid JSON"', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([{ name: 'a.json', type: 'file' }]), { status: 200, headers: { 'content-type': 'application/json' } }));
    const { getRepoFile } = await import('./providers');
    const fj: Remote = { id: 'f', label: 'x', kind: 'forgejo', baseUrl: 'https://git.test', owner: 'o', repo: 'r', branch: 'main', token: 't' };
    await expect(getRepoFile(fj, 'spaces')).rejects.toThrow(/is a folder/);
  });
});
