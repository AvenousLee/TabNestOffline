// Reading iCal (.ics) calendars: Google, Outlook/Office 365, Apple, holiday
// feeds, etc. ical.js does the hard parts (repeating events, exceptions and
// time zones); we turn the result into simple occurrences for a date range.

import ICAL from 'ical.js';
import type { CalEvent } from './types';

/** webcal:// links are plain https underneath. */
export function normalizeIcalUrl(input: string): string {
  return input.trim().replace(/^webcal:\/\//i, 'https://');
}

export interface ParsedCalendar {
  /** The calendar's own name (X-WR-CALNAME), if it has one. */
  name?: string;
  events: ICAL.Event[];
}

/** Parse .ics text. Throws a readable error if it isn't a calendar. */
export function parseIcs(text: string): ParsedCalendar {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link did not return a calendar (no BEGIN:VCALENDAR). Check that it is the iCal / .ics address.');
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new Error('The calendar file could not be read (it may be damaged or not in iCal format).');
  }
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  // Changed single occurrences of a repeating event (RECURRENCE-ID) belong to their main event.
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const comp of root.getAllSubcomponents('vevent')) {
    if (String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED' && !comp.hasProperty('recurrence-id')) continue;
    const ev = new ICAL.Event(comp);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const exc of exceptions) {
    const master = masters.get(exc.uid);
    if (master) master.relateException(exc);
    else masters.set(`${exc.uid}@${exc.recurrenceId.toString()}`, exc); // orphan exception: show on its own
  }
  const name = root.getFirstPropertyValue('x-wr-calname');
  return { name: typeof name === 'string' ? name : undefined, events: [...masters.values()] };
}

const MAX_OCCURRENCES = 5000;

/** All occurrences that overlap [from, to). */
export function occurrences(cal: ParsedCalendar, sourceId: string, from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = [];
  const push = (ev: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    const s = start.toJSDate();
    let e = end.toJSDate();
    if (e <= s) e = new Date(s.getTime() + (start.isDate ? 86_400_000 : 0)); // missing/zero end
    if (e <= from || s >= to) return;
    const status = String(ev.component.getFirstPropertyValue('status') ?? '').toUpperCase();
    if (status === 'CANCELLED') return;
    const url = ev.component.getFirstPropertyValue('url');
    out.push({
      key: `${ev.uid}|${s.toISOString()}`,
      uid: ev.uid,
      sourceId,
      title: ev.summary || '(No title)',
      start: s,
      end: e,
      allDay: start.isDate,
      location: ev.location || undefined,
      description: ev.description || undefined,
      url: typeof url === 'string' ? url : undefined,
    });
  };

  for (const ev of cal.events) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      push(ev, ev.startDate, ev.endDate ?? ev.startDate);
      continue;
    }
    const it = ev.iterator();
    for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
      if (next.toJSDate() >= to) break;
      const d = ev.getOccurrenceDetails(next);
      push(d.item, d.startDate, d.endDate);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
}
