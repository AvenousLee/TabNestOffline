import { afterEach, describe, expect, it, vi } from 'vitest';
import { calendarDataOf, downloadCaldav, mergeIcs, normalizeCaldavUrl, usernameFromUrl } from './caldav';
import { occurrences, parseIcs } from './ics';

const URL_ = 'https://mail.example.com:2080/calendars/alex.tan@example.com/calendar';

const event = (uid: string, start: string, end: string, extra = '') => `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//cPanel//CalDAV//EN\r
BEGIN:VTIMEZONE\r
TZID:Asia/Kuala_Lumpur\r
BEGIN:STANDARD\r
TZOFFSETFROM:+0800\r
TZOFFSETTO:+0800\r
DTSTART:19700101T000000\r
END:STANDARD\r
END:VTIMEZONE\r
BEGIN:VEVENT\r
UID:${uid}\r
DTSTART;TZID=Asia/Kuala_Lumpur:${start}\r
DTEND;TZID=Asia/Kuala_Lumpur:${end}\r
SUMMARY:${uid}\r
${extra}BEGIN:VALARM\r
ACTION:DISPLAY\r
TRIGGER:-PT15M\r
END:VALARM\r
END:VEVENT\r
END:VCALENDAR\r
`;

const multistatus = (...texts: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
${texts
  .map(
    (t, i) => `<d:response><d:href>/calendars/alex.tan@example.com/calendar/${i}.ics</d:href>
<d:propstat><d:prop><cal:calendar-data>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</cal:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
  )
  .join('\n')}
</d:multistatus>`;

describe('webmail calendars (CalDAV)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the username from a cPanel address and adds the closing slash', () => {
    expect(usernameFromUrl(URL_)).toBe('alex.tan@example.com');
    expect(usernameFromUrl('https://cloud.example.com/remote.php/dav/calendars/alex/personal/')).toBe('');
    expect(normalizeCaldavUrl(` ${URL_} `)).toBe(`${URL_}/`);
    expect(normalizeCaldavUrl(`${URL_}/`)).toBe(`${URL_}/`);
  });

  it('merges the events of a calendar-query answer into one calendar', () => {
    const xml = multistatus(event('Standup', '20261103T090000', '20261103T091500', 'RRULE:FREQ=DAILY;COUNT=3\r\n'), event('Review', '20261104T140000', '20261104T150000'));
    const texts = calendarDataOf(xml);
    expect(texts).toHaveLength(2);
    const ics = mergeIcs(texts, 'Work calendar');
    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1); // the same time zone only once
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2); // reminders stay inside their events
    const cal = parseIcs(ics);
    expect(cal.name).toBe('Work calendar');
    const list = occurrences(cal, 's', new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(list.map((e) => e.title).sort()).toEqual(['Review', 'Standup', 'Standup', 'Standup']);
  });

  it('sends the login and asks for events', async () => {
    const fetchMock = vi.fn(async () => new Response(multistatus(event('A', '20261103T090000', '20261103T100000')), { status: 207 }));
    vi.stubGlobal('fetch', fetchMock);
    const ics = await downloadCaldav({ url: URL_, username: 'alex.tan@example.com', password: 'pässword' }, 'Work');
    expect(ics).toContain('SUMMARY:A');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_}/`);
    expect(init.method).toBe('REPORT');
    const headers = init.headers as Record<string, string>;
    expect(headers.Depth).toBe('1');
    expect(atob(headers.Authorization.slice(6))).toBe(new TextDecoder('latin1').decode(new TextEncoder().encode('alex.tan@example.com:pässword')));
  });

  it('falls back to downloading the whole calendar when queries are not supported', async () => {
    const whole = event('B', '20261105T090000', '20261105T100000');
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => (init.method === 'REPORT' ? new Response('', { status: 405 }) : new Response(whole, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadCaldav({ url: URL_, username: 'u', password: 'p' }, 'Work')).toBe(whole);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains a refused login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(downloadCaldav({ url: URL_, username: 'u', password: 'wrong' }, 'Work')).rejects.toThrow(/username or password/);
  });
});
