// Agenda view: events grouped by day. An event that spans several days
// (leave from 1 to 5 Nov, or a late meeting past midnight) is listed on
// every one of its days, like Google Calendar's Schedule view.

import type { CalEvent } from './types';
import { addDays, DAY_MS, dayKey, fmt, sameDay, startOfDay } from './dates';

export interface AgendaItem {
  e: CalEvent;
  /** Which of the event's days this is (1-based) and how many days it has. */
  day: number;
  days: number;
  /** Text for the time column: "All day", "09:30", "until 02:00"… */
  when: string;
}

export interface AgendaDay {
  day: Date;
  items: AgendaItem[];
}

/** Days of an event: all-day events end at midnight after their last day; a timed event ending exactly at midnight doesn't touch that day. */
function spanDays(e: CalEvent): { first: Date; last: Date } {
  const first = startOfDay(e.start);
  const last = startOfDay(new Date(Math.max(e.start.getTime(), e.end.getTime() - 1)));
  return { first, last };
}

const dayCount = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS) + 1;

export function agendaDays(events: CalEvent[], from: Date, count: number): AgendaDay[] {
  const start = startOfDay(from);
  const end = addDays(start, count);
  const byDay = new Map<string, AgendaDay>();
  for (const e of events) {
    const { first, last } = spanDays(e);
    const days = dayCount(first, last);
    for (let d = first < start ? start : first, i = dayCount(first, d); d <= last && d < end; d = addDays(d, 1), i++) {
      const when = e.allDay || (i > 1 && i < days) ? 'All day' : i === 1 ? fmt.time(e.start) : `until ${fmt.time(e.end)}`;
      const k = dayKey(d);
      if (!byDay.has(k)) byDay.set(k, { day: d, items: [] });
      byDay.get(k)!.items.push({ e, day: i, days, when });
    }
  }
  const list = [...byDay.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
  // On each day: all-day and continuing events first, then by start time.
  for (const d of list) {
    const rank = (it: AgendaItem) => (it.when === 'All day' ? 0 : it.when.startsWith('until') ? 1 : 2);
    const at = (it: AgendaItem) => (sameDay(it.e.start, d.day) ? it.e.start.getTime() : d.day.getTime());
    d.items.sort((a, b) => rank(a) - rank(b) || at(a) - at(b) || a.e.title.localeCompare(b.e.title));
  }
  return list;
}
