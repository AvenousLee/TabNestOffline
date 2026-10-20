// Card pictures: shrink uploaded images so they can live inside the space
// (synced through git and embedded in shared HTML files), and find a
// website's own preview picture (the one chat apps show for a link).

const MAX_SIDE = 480;
const TARGET_BYTES = 80_000;

/** Approximate byte size of a data: URL. */
export const dataUrlBytes = (dataUrl: string) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

/** Resize to at most 480px and compress (WebP, falling back to JPEG) until it's small. */
export async function shrinkImage(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Could not read that image. Try a PNG, JPEG or WebP file.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let out = '';
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    out = canvas.toDataURL('image/webp', quality);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', quality); // no WebP encoder
    if (dataUrlBytes(out) <= TARGET_BYTES) break;
  }
  return out;
}

/** Pull the preview image address out of a page's HTML (og:image, twitter:image, …). */
export function extractPreviewImage(html: string, pageUrl: string): string | undefined {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pick = (sel: string, attr: string) => doc.querySelector(sel)?.getAttribute(attr)?.trim();
  const found =
    pick('meta[property="og:image:secure_url"]', 'content') ||
    pick('meta[property="og:image"]', 'content') ||
    pick('meta[property="og:image:url"]', 'content') ||
    pick('meta[name="twitter:image"]', 'content') ||
    pick('meta[name="twitter:image:src"]', 'content') ||
    pick('link[rel="image_src"]', 'href');
  if (!found) return undefined;
  try {
    const abs = new URL(found, pageUrl);
    return /^https?:$/.test(abs.protocol) ? abs.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a page and return its preview image link. Needs host permission for
 * that site (TabNest asks first). Returns undefined if the page has none.
 */
export async function fetchPreviewImage(pageUrl: string): Promise<string | undefined> {
  if (!/^https?:/i.test(pageUrl)) return undefined;
  const res = await fetch(pageUrl, { credentials: 'include', redirect: 'follow' });
  if (!res.ok) throw new Error(`The website answered ${res.status}.`);
  if (!(res.headers.get('content-type') ?? '').includes('html')) return undefined;
  // The preview tags are in <head>; no need to read huge pages to the end.
  const html = (await res.text()).slice(0, 400_000);
  return extractPreviewImage(html, res.url || pageUrl);
}
