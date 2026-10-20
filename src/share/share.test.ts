import { describe, expect, it } from 'vitest';
import type { Remote, Space } from '../types';
import { buildBundle, buildShareHtml, parseImport, resolveCheckUrl } from './share';
import { base64ToUtf8, utf8ToBase64 } from '../lib/util';

const space = (extra: Partial<Space> = {}): Space => ({
  id: 'abc',
  name: 'SI Work </script><b>',
  color: '#e8a33d',
  updatedAt: '2026-05-01T10:00:00.000Z',
  share: { mode: 'snapshot' },
  collections: [{ id: 'c', name: 'Tools', collapsed: true, cards: [{ id: 'k', title: 'GitLab — 日本', url: 'https://gitlab.example/' }] }],
  ...extra,
});

const forgejo: Remote = { id: 'r', label: 'Work', kind: 'forgejo', baseUrl: 'https://git.corp.local', owner: 'ave', repo: 'spaces', branch: 'main', token: 'SECRET' };
const github: Remote = { ...forgejo, id: 'g', kind: 'github', baseUrl: '' };

describe('share HTML', () => {
  it('round-trips through export and import without leaking settings', () => {
    const s = space({ sync: { target: { type: 'repo', remoteId: 'r', path: 'spaces/si.json' }, policy: 'ask', autoPush: true } });
    const html = buildShareHtml(buildBundle([s], [forgejo]));
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('</script><b>'); // name is escaped inside the data block
    const [back] = parseImport(html);
    expect(back.id).toBe('abc');
    expect(back.content.name).toBe(s.name);
    expect(back.content.collections[0].cards[0].title).toBe('GitLab — 日本');
    expect(back.content.collections[0]).not.toHaveProperty('collapsed');
    expect(back.checkUrl).toBeUndefined(); // snapshot mode
  });

  it('includes an update link only in check mode', () => {
    const s = space({ share: { mode: 'check' }, sync: { target: { type: 'repo', remoteId: 'g', path: 'spaces/si.json' }, policy: 'ask', autoPush: true } });
    expect(resolveCheckUrl(s, [github])).toBe('https://raw.githubusercontent.com/ave/spaces/main/spaces/si.json');
    expect(resolveCheckUrl({ ...s, sync: { ...s.sync!, target: { type: 'repo', remoteId: 'r', path: 'spaces/si.json' } } }, [forgejo])).toBe(
      'https://git.corp.local/api/v1/repos/ave/spaces/raw/spaces/si.json?ref=main',
    );
    expect(resolveCheckUrl({ ...s, share: { mode: 'check', checkUrl: 'https://x.test/a.json' } }, [github])).toBe('https://x.test/a.json');
    const [back] = parseImport(buildShareHtml(buildBundle([s], [github])));
    expect(back.checkUrl).toContain('raw.githubusercontent.com');
  });

  it('rejects files that are not TabNest files', () => {
    expect(() => parseImport('<html><body>hi</body></html>')).toThrow(/not made by TabNest/);
    expect(() => parseImport('{"hello":1}')).toThrow(/not a TabNest/);
  });
});

describe('base64', () => {
  it('handles non-ASCII text', () => {
    const t = 'Héllo 世界 🎉';
    expect(base64ToUtf8(utf8ToBase64(t))).toBe(t);
  });
});

describe('Toby import', () => {
  it('reads groups → spaces and lists → collections, preferring custom titles', () => {
    const toby = {
      version: 3,
      groups: [
        { name: 'SI Work', lists: [{ title: 'Tools', cards: [{ title: 'Google', url: 'https://google.com', customTitle: 'Search', customDescription: 'main search' }] }] },
        { name: 'Personal', lists: [{ title: 'Read later', cards: [{ title: 'MDN', url: 'https://developer.mozilla.org' }, { title: 'no url' }] }] },
      ],
    };
    const spaces = parseImport(JSON.stringify(toby));
    expect(spaces.map((s) => s.content.name)).toEqual(['SI Work', 'Personal']);
    expect(spaces[0].content.collections[0].cards[0]).toMatchObject({ title: 'Search', note: 'main search', url: 'https://google.com' });
    expect(spaces[1].content.collections[0].cards).toHaveLength(1);
    expect(spaces[0].id).toBe('');
  });

  it('reads the older single-list format', () => {
    const spaces = parseImport(JSON.stringify({ version: 2, lists: [{ title: 'A', cards: [{ title: 't', url: 'https://a.test' }] }] }));
    expect(spaces).toHaveLength(1);
    expect(spaces[0].content.name).toBe('Toby import');
  });

  it('explains an empty Toby export', () => {
    expect(() => parseImport(JSON.stringify({ groups: [] }))).toThrow(/no links/);
  });
});

describe('shared by', () => {
  it('includes owner and source page only when given', () => {
    const s = space({ share: { mode: 'check' }, sync: { target: { type: 'repo', remoteId: 'r', path: 'spaces/si.json' }, policy: 'ask', autoPush: true } });
    const b = buildBundle([s], [forgejo], { name: 'Avenous', contact: 'a@corp.test' });
    expect(b.sharedBy).toEqual({ name: 'Avenous', contact: 'a@corp.test' });
    expect(b.spaces[0].sourceUrl).toBe('https://git.corp.local/ave/spaces/src/branch/main/spaces/si.json');
    expect(buildBundle([s], [forgejo], { name: ' ', contact: '' }).sharedBy).toBeUndefined();
  });
});
