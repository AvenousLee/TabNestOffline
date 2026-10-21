// The Calendar page shows events from linked calendars.
//
// Linked calendars (and their addresses) are kept on this device only: an iCal
// "secret address" works like a password, and spaces can sync to public repos.

export type CalendarView = 'year' | 'month' | 'week' | 'agenda';

/** A calendar shown on the Calendar page. */
export interface CalendarSource {
  id: string;
  /** "My calendars" (from your own signed-in account, later) or "Other calendars" (iCal links). */
  group: 'mine' | 'other';
  /** Shown in the list; defaults to the calendar's own name. */
  name: string;
  color: string;
  /** Hidden calendars stay linked but their events aren't shown. */
  enabled: boolean;
  kind: 'ical';
  /** iCal address (webcal:// is turned into https://). */
  url: string;
  lastFetchedAt?: string;
  lastError?: string;
}

/** One occurrence of an event, ready to draw. */
export interface CalEvent {
  /** Unique per occurrence (uid + start). */
  key: string;
  uid: string;
  sourceId: string;
  title: string;
  start: Date;
  /** Exclusive end (an all-day event on the 22nd ends at the 23rd, 00:00). */
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  url?: string;
}
