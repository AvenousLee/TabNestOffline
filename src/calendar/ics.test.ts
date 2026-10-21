import { describe, expect, it } from 'vitest';
import { normalizeIcalUrl, occurrences, parseIcs } from './ics';
import { coversDay, monthGrid, startOfWeek } from './dates';

// Shaped like a Google Calendar "secret address in iCal format" export.
const GOOGLE_LIKE = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
X-WR-CALNAME:SI Team – AL
X-WR-TIMEZONE:Asia/Kuala_Lumpur
BEGIN:VTIMEZONE
TZID:Asia/Kuala_Lumpur
BEGIN:STANDARD
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:+08
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:al-userA@google.com
DTSTART;VALUE=DATE:20261022
DTEND;VALUE=DATE:20261024
SUMMARY:AL – User A
END:VEVENT
BEGIN:VEVENT
UID:standup@google.com
DTSTART;TZID=Asia/Kuala_Lumpur:20261019T093000
DTEND;TZID=Asia/Kuala_Lumpur:20261019T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6
EXDATE;TZID=Asia/Kuala_Lumpur:20261021T093000
SUMMARY:Stand-up
LOCATION:Teams
END:VEVENT
BEGIN:VEVENT
UID:standup@google.com
RECURRENCE-ID;TZID=Asia/Kuala_Lumpur:20261023T093000
DTSTART;TZID=Asia/Kuala_Lumpur:20261023T110000
DTEND;TZID=Asia/Kuala_Lumpur:20261023T111500
SUMMARY:Stand-up (moved)
END:VEVENT
BEGIN:VEVENT
UID:cancelled@google.com
DTSTART;VALUE=DATE:20261025
DTEND;VALUE=DATE:20261026
SUMMARY:Cancelled trip
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

describe('parseIcs / occurrences', () => {
  const cal = parseIcs(GOOGLE_LIKE);
  const oct = occurrences(cal, 'src', new Date(2026, 9, 1), new Date(2026, 10, 1));

  it('reads the calendar name', () => {
    expect(cal.name).toBe('SI Team – AL');
  });

  it('reads a 2-day all-day event (end is exclusive)', () => {
    const al = oct.find((e) => e.title === 'AL – User A')!;
    expect(al.allDay).toBe(true);
    expect(al.start).toEqual(new Date(2026, 9, 22));
    expect(al.end).toEqual(new Date(2026, 9, 24));
    expect(coversDay(al.start, al.end, new Date(2026, 9, 23))).toBe(true);
    expect(coversDay(al.start, al.end, new Date(2026, 9, 24))).toBe(false);
  });

  it('expands repeating events, skips excluded dates and applies moved occurrences', () => {
    const standups = oct.filter((e) => e.uid === 'standup@google.com');
    // COUNT=6 → Mon 19, Wed 21 (excluded), Fri 23 (moved), Mon 26, Wed 28, Fri 30.
    expect(standups).toHaveLength(5);
    expect(standups.find((e) => e.title === 'Stand-up (moved)')).toBeTruthy();
    expect(standups[0].location).toBe('Teams');
  });

  it('leaves out cancelled events', () => {
    expect(oct.find((e) => e.title === 'Cancelled trip')).toBeUndefined();
  });

  it('only returns events in the requested range', () => {
    expect(occurrences(cal, 'src', new Date(2026, 11, 1), new Date(2027, 0, 1))).toHaveLength(0);
  });

  it('explains a link that is not a calendar', () => {
    expect(() => parseIcs('<html>login page</html>')).toThrow(/did not return a calendar/);
  });

  it('turns webcal:// into https://', () => {
    expect(normalizeIcalUrl(' webcal://outlook.office365.com/owa/calendar/x/calendar.ics ')).toBe('https://outlook.office365.com/owa/calendar/x/calendar.ics');
  });
});

describe('calendar grid', () => {
  it('starts weeks on the chosen day and always shows 6 weeks', () => {
    const grid = monthGrid(new Date(2026, 9, 15), 1);
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1); // Monday
    expect(grid[0] <= new Date(2026, 9, 1)).toBe(true);
    expect(startOfWeek(new Date(2026, 9, 21), 0).getDay()).toBe(0); // Sunday start
  });
});
