import { describe, expect, it } from 'vitest';
import type { Space } from '../types';
import { buildBundle, buildShareHtml, parseImport } from './share';
import { buildPrintHtml, embedLinkedImages, linkedImageOrigins } from './print';

const UPLOADED = 'data:image/webp;base64,UklGRg==';
const space: Space = {
  id: 's',
  name: 'Work <b>',
  color: '#4c7bd6',
  updatedAt: '2026-10-20T10:00:00.000Z',
  share: { mode: 'snapshot' },
  collections: [
    {
      id: 'c',
      name: 'Tools',
      cards: [
        { id: 'a', title: 'Uploaded', url: 'https://a.test/', image: UPLOADED, note: 'has a picture' },
        { id: 'b', title: 'Linked', url: 'https://b.test/', image: 'https://cdn.test/b.png' },
        { id: 'c', title: 'Evil', url: 'javascript:alert(1)' },
      ],
    },
  ],
};

describe('pictures in shared HTML files', () => {
  it('uploaded pictures are inside the file; linked ones stay links', () => {
    const html = buildShareHtml(buildBundle([space], []));
    expect(html).toContain(UPLOADED);
    const [back] = parseImport(html);
    expect(back.content.collections[0].cards[0].image).toBe(UPLOADED);
    expect(back.content.collections[0].cards[1].image).toBe('https://cdn.test/b.png');
  });

  it('can embed linked pictures so they work offline', async () => {
    const bundle = buildBundle([space], []);
    expect(linkedImageOrigins(bundle)).toEqual(['https://cdn.test']);
    const res = await embedLinkedImages(bundle, async () => 'data:image/webp;base64,EMBEDDED');
    expect(res).toMatchObject({ embedded: 1, failed: 0 });
    expect(buildShareHtml(res.bundle)).toContain('data:image/webp;base64,EMBEDDED');
    const failing = await embedLinkedImages(bundle, async () => {
      throw new Error('offline');
    });
    expect(failing).toMatchObject({ embedded: 0, failed: 1 });
    expect(failing.bundle.spaces[0].content.collections[0].cards[1].image).toBe('https://cdn.test/b.png');
  });
});

describe('PDF (print) layout', () => {
  const html = buildPrintHtml(buildBundle([space], [], { name: 'Avenous', contact: 'a@corp.test' }));
  it('has clickable links, pictures, notes and who shared it', () => {
    expect(html).toContain('href="https://a.test/"');
    expect(html).toContain(UPLOADED);
    expect(html).toContain('has a picture');
    expect(html).toContain('Shared by Avenous (a@corp.test)');
  });
  it('escapes text, blocks script links and contains no scripts', () => {
    expect(html).toContain('Work &#60;b&#62;');
    expect(html).not.toMatch(/href="javascript:/i); // shown as text only, never as a link
    expect(html).toContain('href="#"');
    expect(html).not.toMatch(/<script/i);
  });
});
