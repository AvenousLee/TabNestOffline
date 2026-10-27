// The Calendar page shows events from linked calendars.
//
// Linked calendars (and their addresses) are kept on this device only: an iCal
// "secret address" works like a password, and spaces can sync to public repos.

export type CalendarView = 'year' | 'month' | 'week' | 'agenda';

/** A calendar shown on the Calendar page. */
export interface CalendarSource {
  id: string;
  /** "My calendars" (from a signed-in Google account) or "Other calendars" (iCal links). */
  group: 'mine' | 'other';
  /** Shown in the list; defaults to the calendar's own name. */
  name: string;
  color: string;
  /** Hidden calendars stay linked but their events aren't shown. */
  enabled: boolean;
  kind: 'ical' | 'google';
  /** iCal address (webcal:// is turned into https://). Empty for Google calendars. */
  url: string;
  /** Google: the account's email and the calendar's id in it. */
  account?: string;
  calendarId?: string;
  /** Google: the account may add and change events here (owner or writer). */
  canEdit?: boolean;
  lastFetchedAt?: string;
  lastError?: string;
}

/** A Google account signed in on the Calendar page. */
export interface GoogleAccount {
  email: string;
  /** Silent renewal failed: the user must click "Sign in again". */
  needsSignIn?: boolean;
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
  /** Google events: id of this occurrence, its page in Google Calendar, and whether TabNest may change it. */
  googleId?: string;
  htmlLink?: string;
  recurring?: boolean;
  editable?: boolean;
}
