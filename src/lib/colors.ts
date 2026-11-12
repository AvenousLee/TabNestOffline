export const SPACE_COLORS = ['#d64c78', '#e8a33d', '#4c7bd6', '#3dae7a', '#8a5cd6', '#d6604c', '#3aa6b9', '#8c8c96'];

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/**
 * A colour typed by the user as "#3a7bd5", "3a7bd5", "#37d", "rgb(58, 123, 213)" or "58, 123, 213",
 * as "#rrggbb" (lower case), or null if it isn't one. Transparency (rgba) is ignored.
 */
export function parseColor(input: string): string | null {
  const t = input.trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(t);
  if (m) return `#${m[1]}`;
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^(?:rgba?\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*[\d.]+%?)?\s*\)?$/.exec(t);
  if (m && (t.startsWith('rgb') === t.endsWith(')'))) {
    const rgb = [m[1], m[2], m[3]].map(Number);
    if (rgb.every((v) => v <= 255)) return `#${rgb.map(hex2).join('')}`;
  }
  return null;
}
