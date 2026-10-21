// PDF sharing and offline pictures.
//
// PDF: we build a static, print-friendly page (no scripts) and open Chrome's
// print window on it, where the user picks "Save as PDF". Chrome keeps the
// links clickable in the PDF. (Writing a PDF directly would need the
// "debugger" permission, which shows a scary warning bar.)

import type { ShareBundle } from '../types';
import { shrinkImage } from '../lib/image';
import { hostOf } from '../lib/util';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeHref = (u: string) => (/^(https?|ftp|file|mailto):/i.test(u) ? u : '#');
const isImage = (u: string | undefined): u is string => !!u && (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(u) || /^https?:\/\//i.test(u));

export function buildPrintHtml(bundle: ShareBundle): string {
  const date = new Date(bundle.exportedAt).toLocaleString();
  const by = bundle.sharedBy?.name ? ` by ${esc(bundle.sharedBy.name)}${bundle.sharedBy.contact ? ` (${esc(bundle.sharedBy.contact)})` : ''}` : '';
  const spaces = bundle.spaces
    .map((sp) => {
      const n = sp.content.collections.reduce((a, c) => a + c.cards.length, 0);
      const cols = sp.content.collections
        .filter((c) => c.cards.length)
        .map(
          (c) => `<section class="col"><h2>${esc(c.name)} <span>${c.cards.length} ${c.cards.length === 1 ? 'link' : 'links'}</span></h2><div class="grid">${c.cards
            .map(
              (k) => `<${k.url ? `a class="card" href="${esc(safeHref(k.url))}"` : 'div class="card note"'}>${isImage(k.image) ? `<img src="${esc(k.image)}" alt="">` : ''}<b>${esc(k.title || k.url || 'Note')}</b>${
                k.note ? `<p>${esc(k.note)}</p>` : ''
              }${k.url ? `<small>${esc(hostOf(k.url))}</small><u>${esc(k.url)}</u></a>` : '<small>Note</small></div>'}`,
            )
            .join('')}</div></section>`,
        )
        .join('');
      return `<article class="space"><h1><i style="background:${esc(sp.content.color)}"></i>${esc(sp.content.name)}</h1><div class="meta">${sp.content.collections.length} collections · ${n} links · version of ${esc(
        new Date(sp.updatedAt).toLocaleString(),
      )}</div>${cols || '<p class="meta">This space is empty.</p>'}</article>`;
    })
    .join('');
  const title = bundle.spaces.length === 1 ? bundle.spaces[0].content.name : `${bundle.spaces.length} shared spaces`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10.5pt/1.35 system-ui, 'Segoe UI', Roboto, sans-serif; color: #1d1d22; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.space + .space { break-before: page; }
h1 { font-size: 18pt; margin: 0 0 2pt; display: flex; align-items: center; gap: 8pt; }
h1 i { width: 12pt; height: 12pt; border-radius: 3pt; display: inline-block; }
.meta { color: #6a6a75; font-size: 9pt; margin-bottom: 10pt; }
.col { margin-top: 12pt; }
h2 { font-size: 12.5pt; margin: 0 0 6pt; break-after: avoid; }
h2 span { color: #6a6a75; font-size: 9pt; font-weight: 400; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7pt; }
.card { display: flex; flex-direction: column; gap: 3pt; border: 0.75pt solid #d8d8e0; border-radius: 6pt; padding: 7pt 8pt; color: inherit; text-decoration: none; break-inside: avoid; overflow: hidden; }
.card img { width: calc(100% + 16pt); margin: -7pt -8pt 2pt; height: 70pt; object-fit: cover; }
.card b { overflow-wrap: anywhere; }
.card p { margin: 0; color: #4a4a55; font-size: 9pt; overflow-wrap: anywhere; }
.card small { color: #6a6a75; font-size: 8.5pt; }
.card u { color: #2b59c3; font-size: 7.5pt; text-decoration: none; overflow-wrap: anywhere; }
.card.note { border-left: 2.5pt solid #e8a33d; }
.card.note p { color: #1d1d22; white-space: pre-line; }
footer { margin-top: 16pt; color: #6a6a75; font-size: 8.5pt; }
</style></head><body>${spaces}<footer>Shared${by} from TabNest on ${esc(date)}. Click a card to open its link.</footer></body></html>`;
}

const JOB_KEY = 'tabnest-print-job';

interface PrintJob {
  html: string;
  fileName: string;
}

/**
 * Open the print layout in its own tab (print.html), which shows Chrome's print
 * window: choose "Save as PDF". Printing a real page (not a hidden frame) keeps
 * the links clickable in the PDF, and the tab title becomes the file name.
 */
export async function printToPdf(html: string, fileName: string): Promise<void> {
  const job: PrintJob = { html, fileName };
  if (typeof chrome !== 'undefined' && chrome.storage?.local && chrome.tabs?.create) {
    await chrome.storage.local.set({ [JOB_KEY]: job });
    await chrome.tabs.create({ url: chrome.runtime.getURL('print.html') });
    return;
  }
  // Outside the extension (npm run dev): same idea with localStorage and a normal window.
  localStorage.setItem(JOB_KEY, JSON.stringify(job));
  window.open('print.html', '_blank');
}

/** Used by print.html: take (and remove) the waiting print job. */
export async function takePrintJob(): Promise<PrintJob | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const job = (await chrome.storage.local.get(JOB_KEY))[JOB_KEY] as PrintJob | undefined;
    await chrome.storage.local.remove(JOB_KEY);
    return job ?? null;
  }
  const raw = localStorage.getItem(JOB_KEY);
  localStorage.removeItem(JOB_KEY);
  return raw ? (JSON.parse(raw) as PrintJob) : null;
}

/** Web addresses of linked (not uploaded) pictures in a bundle, grouped by site. */
export function linkedImageOrigins(bundle: ShareBundle): string[] {
  const origins = new Set<string>();
  for (const sp of bundle.spaces)
    for (const c of sp.content.collections)
      for (const k of c.cards) if (k.image && /^https?:\/\//i.test(k.image)) origins.add(new URL(k.image).origin);
  return [...origins];
}

/**
 * Download linked pictures and put them inside the bundle, so the shared file
 * shows them offline. Pictures that can't be fetched stay as links.
 */
export async function embedLinkedImages(
  bundle: ShareBundle,
  load: (url: string) => Promise<string> = async (url) => shrinkImage(await (await fetch(url)).blob()),
): Promise<{ bundle: ShareBundle; embedded: number; failed: number }> {
  let embedded = 0;
  let failed = 0;
  const cache = new Map<string, string | null>();
  const spaces = [];
  for (const sp of bundle.spaces) {
    const collections = [];
    for (const c of sp.content.collections) {
      const cards = [];
      for (const k of c.cards) {
        if (!k.image || !/^https?:\/\//i.test(k.image)) {
          cards.push(k);
          continue;
        }
        if (!cache.has(k.image)) {
          try {
            cache.set(k.image, await load(k.image));
          } catch {
            cache.set(k.image, null);
          }
        }
        const data = cache.get(k.image);
        if (data) embedded++;
        else failed++;
        cards.push(data ? { ...k, image: data } : k);
      }
      collections.push({ ...c, cards });
    }
    spaces.push({ ...sp, content: { ...sp.content, collections } });
  }
  return { bundle: { ...bundle, spaces }, embedded, failed };
}
