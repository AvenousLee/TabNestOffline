import { describe, expect, it } from 'vitest';
import { extractPreviewImage } from './image';
import { contentOf } from './spaceFile';

describe('extractPreviewImage', () => {
  it('finds og:image and makes it absolute', () => {
    const html = '<html><head><meta property="og:image" content="/img/cover.png"></head></html>';
    expect(extractPreviewImage(html, 'https://site.test/page/1')).toBe('https://site.test/img/cover.png');
  });
  it('falls back to twitter:image', () => {
    expect(extractPreviewImage('<meta name="twitter:image" content="https://cdn.test/x.jpg">', 'https://a.test/')).toBe('https://cdn.test/x.jpg');
  });
  it('ignores pages without a preview and non-web addresses', () => {
    expect(extractPreviewImage('<title>hi</title>', 'https://a.test/')).toBeUndefined();
    expect(extractPreviewImage('<meta property="og:image" content="javascript:alert(1)">', 'https://a.test/')).toBeUndefined();
  });
});

describe('card pictures in space files', () => {
  const space = (image: string) => ({ name: 's', color: '#000', collections: [{ id: 'c', name: 'c', cards: [{ id: 'k', title: 't', url: 'https://a.test', image }] }] });
  it('keeps uploaded images and web links', () => {
    expect(contentOf(space('data:image/webp;base64,AAAA')).collections[0].cards[0].image).toBe('data:image/webp;base64,AAAA');
    expect(contentOf(space('https://cdn.test/a.png')).collections[0].cards[0].image).toBe('https://cdn.test/a.png');
  });
  it('drops anything that is not an image (e.g. scripts in a shared file)', () => {
    expect(contentOf(space('javascript:alert(1)')).collections[0].cards[0]).not.toHaveProperty('image');
    expect(contentOf(space('data:text/html;base64,PHNjcmlwdD4=')).collections[0].cards[0]).not.toHaveProperty('image');
  });
});
