// Webmail calendars over CalDAV (e.g. cPanel webmail on port 2080, Nextcloud,
// Fastmail). View only: TabNest asks the server for all events of one
// calendar and turns the answer into a single .ics text, so the iCal reader
// and the cache work the same as for iCal links.

import { utf8ToBase64 } from '../lib/util';

/** Addresses of calendar collections end with "/"; some servers refuse them without. */
export function normalizeCaldavUrl(raw: string): string {
  const url = raw.trim();
  return url.endsWith('/') ? url : `${url}/`;
}

/** cPanel-style addresses name the account: https://mail.example.com:2080/calendars/<email>/calendar */
export function usernameFromUrl(raw: string): string {
  try {
    const parts = new URL(raw.trim()).pathname.split('/').map(decodeURIComponent);
    const i = parts.indexOf('calendars');
    const name = i >= 0 ? parts[i + 1] : '';
    return name && name.includes('@') ? name : '';
  } catch {
    return '';
  }
}

const QUERY = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>
</c:calendar-query>`;

/** The .ics texts inside a CalDAV "multistatus" answer. */
export function calendarDataOf(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The calendar server sent an answer TabNest could not read.');
  return Array.from(doc.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data'))
    .map((n) => n.textContent ?? '')
    .filter((t) => t.includes('BEGIN:VCALENDAR'));
}

/** Blocks like BEGIN:VEVENT … END:VEVENT at the top level of a VCALENDAR (with nested VALARMs kept inside). */
function blocks(ics: string, name: string): string[] {
  const lines = ics.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let cur: string[] | null = null;
  let depth = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (cur) {
      cur.push(line);
      if (line.startsWith('BEGIN:')) depth++;
      else if (line.startsWith('END:') && --depth === 0) {
        out.push(cur.join('\r\n'));
        cur = null;
      }
    } else if (line === `BEGIN:${name}`) {
      cur = [line];
      depth = 1;
    }
  }
  return out;
}

/** One .ics with every event (and each time zone once) from the per-event texts the server returns. */
export function mergeIcs(texts: string[], name: string): string {
  const zones = new Map<string, string>();
  const events: string[] = [];
  for (const t of texts) {
    for (const z of blocks(t, 'VTIMEZONE')) {
      const id = /^TZID:(.*)$/m.exec(z.replace(/\r\n/g, '\n'))?.[1]?.trim() ?? z;
      if (!zones.has(id)) zones.set(id, z);
    }
    events.push(...blocks(t, 'VEVENT'));
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TabNest//CalDAV//EN', `X-WR-CALNAME:${name.replace(/[\r\n]/g, ' ')}`, ...zones.values(), ...events, 'END:VCALENDAR', ''].join('\r\n');
}

export interface CaldavLogin {
  url: string;
  username: string;
  password: string;
}

/** All events of the calendar as one .ics text. */
export async function downloadCaldav(login: CaldavLogin, name: string): Promise<string> {
  const url = normalizeCaldavUrl(login.url);
  const auth = `Basic ${utf8ToBase64(`${login.username}:${login.password}`)}`;
  const call = (method: string, body?: string) =>
    fetch(url, {
      method,
      body,
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: auth, ...(body ? { 'Content-Type': 'application/xml; charset=utf-8', Depth: '1' } : {}) },
    });
  let res: Response;
  try {
    res = await call('REPORT', QUERY);
    // A few servers don't answer calendar queries but hand out the whole calendar.
    if (res.status === 400 || res.status === 405 || res.status === 501) res = await call('GET');
  } catch {
    throw new Error('Could not reach the webmail calendar. Check the address and your network / VPN.');
  }
  if (res.status === 401) throw new Error('The webmail refused the username or password. Use your full email address and its password.');
  if (res.status === 403) throw new Error('This account may not read that calendar (403). Check the address.');
  if (res.status === 404) throw new Error('No calendar at that address (404). Check the address.');
  if (!res.ok) throw new Error(`The webmail calendar answered ${res.status}.`);
  const text = await res.text();
  if (text.trimStart().startsWith('BEGIN:VCALENDAR')) return text;
  return mergeIcs(calendarDataOf(text), name);
}
