// Small date helpers for the calendar views (local time).

export const DAY_MS = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** First day of the week for the user's locale (0 = Sunday, 1 = Monday). Falls back to Monday. */
export function weekStartDay(): number {
  try {
    const info = (new Intl.Locale(navigator.language) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } });
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (first) return first % 7; // Intl uses 1 = Monday … 7 = Sunday
  } catch {
    /* older browsers */
  }
  return 1;
}

export function startOfWeek(d: Date, first = weekStartDay()): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() - first + 7) % 7));
}

/** 6 weeks × 7 days covering the month of `d`. */
export function monthGrid(d: Date, first = weekStartDay()): Date[] {
  const start = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1), first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Does an event [start, end) touch this day? */
export function coversDay(start: Date, end: Date, day: Date): boolean {
  const s = startOfDay(day).getTime();
  return start.getTime() < s + DAY_MS && end.getTime() > s;
}

export const fmt = {
  monthYear: (d: Date) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  monthShort: (d: Date) => d.toLocaleDateString(undefined, { month: 'short' }),
  monthLong: (d: Date) => d.toLocaleDateString(undefined, { month: 'long' }),
  weekday: (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' }),
  dayLong: (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  time: (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  range(a: Date, b: Date) {
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    if (a.getFullYear() !== b.getFullYear()) opts.year = 'numeric';
    return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, { ...opts, year: 'numeric' })}`;
  },
};

/** "22–23 Oct", "All day", "9:00 – 10:30" … for an event. */
export function describeTime(e: { start: Date; end: Date; allDay: boolean }): string {
  if (e.allDay) {
    const last = addDays(e.end, -1);
    return sameDay(e.start, last) ? 'All day' : `All day, ${fmt.range(e.start, last)}`;
  }
  return sameDay(e.start, e.end) || e.end.getTime() - e.start.getTime() < DAY_MS
    ? `${fmt.time(e.start)} – ${fmt.time(e.end)}`
    : `${e.start.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} – ${e.end.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
}
