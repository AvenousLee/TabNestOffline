// print.html: shows the PDF layout prepared by Share → PDF and opens Chrome's
// print window ("Save as PDF"). A small bar (hidden when printing) lets the
// user print again or close the tab.

import { takePrintJob } from './share/print';

const BAR_CSS = `
.tn-bar { position: sticky; top: 0; z-index: 9; display: flex; gap: 10px; align-items: center; padding: 10px 14px; margin: -14mm -12mm 12px; background: #1f1f22; color: #ececf0; font: 13px system-ui, 'Segoe UI', sans-serif; }
.tn-bar span { flex: 1; }
.tn-bar button { font: inherit; border: 0; border-radius: 7px; padding: 6px 12px; cursor: pointer; background: #333338; color: #fff; }
.tn-bar button.primary { background: #c2416b; }
body { padding: 14mm 12mm; }
@media print { .tn-bar { display: none; } body { padding: 0; } }
`;

async function main() {
  const job = await takePrintJob();
  if (!job) {
    document.body.textContent = 'Nothing to print. In TabNest, use Share → PDF.';
    return;
  }
  const doc = new DOMParser().parseFromString(job.html, 'text/html');
  document.head.innerHTML = doc.head.innerHTML;
  // Chrome suggests the tab title as the PDF file name.
  document.title = job.fileName;
  document.body.innerHTML = doc.body.innerHTML;

  const style = document.createElement('style');
  style.textContent = BAR_CSS;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'tn-bar';
  const label = document.createElement('span');
  label.textContent = 'In the print window, choose “Save as PDF” as the printer. Links stay clickable in the PDF.';
  const again = document.createElement('button');
  again.className = 'primary';
  again.textContent = 'Print / Save as PDF';
  again.onclick = () => window.print();
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.onclick = () => window.close();
  bar.append(label, again, close);
  document.body.prepend(bar);

  // Wait for pictures so they appear in the PDF (give up on slow ones after 8 s).
  await Promise.race([
    Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r)))))),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  window.print();
}

void main();
