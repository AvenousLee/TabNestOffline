import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthUrl, GOOGLE_SCOPES, listEvents, parseAuthResponse, toCalEvent, toGoogleBody, TokenRejected } from './google';

const REDIRECT = 'https://abcdef.chromiumapp.org/';

describe('Google sign-in', () => {
  it('lets the user pick an account when adding one, and renews silently for a known one', () => {
    const add = new URL(buildAuthUrl({ clientId: 'id.apps.googleusercontent.com', redirectUri: REDIRECT }));
    expect(add.searchParams.get('prompt')).toBe('select_account');
    expect(add.searchParams.get('response_type')).toBe('token');
    expect(add.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '));
    expect(add.searchParams.has('login_hint')).toBe(false);

    const renew = new URL(buildAuthUrl({ clientId: 'id', redirectUri: REDIRECT, loginHint: 'me@work.test', silent: true }));
    expect(renew.searchParams.get('prompt')).toBe('none');
    expect(renew.searchParams.get('login_hint')).toBe('me@work.test');

    const again = new URL(buildAuthUrl({ clientId: 'id', redirectUri: REDIRECT, loginHint: 'me@work.test' }));
    expect(again.searchParams.has('prompt')).toBe(false); // Google asks only what it needs
  });

  it('reads the token from the redirect address', () => {
    const t = parseAuthResponse(`${REDIRECT}#access_token=ya29.x&expires_in=3599&scope=${encodeURIComponent(GOOGLE_SCOPES.join(' '))}`, 1000);
    expect(t).toEqual({ accessToken: 'ya29.x', expiresAt: 1000 + 3599_000 });
  });

  it('explains a cancelled sign-in or a missing permission', () => {
    expect(() => parseAuthResponse(`${REDIRECT}#error=access_denied`)).toThrow(/cancelled/);
    expect(() => parseAuthResponse(`${REDIRECT}#access_token=x&scope=${encodeURIComponent(GOOGLE_SCOPES[0])}`)).toThrow(/tick both/);
  });
});

describe('Google events', () => {
  it('turns all-day and timed events into calendar events', () => {
    const allDay = toCalEvent({ id: 'a', summary: 'AL', start: { date: '2026-10-22' }, end: { date: '2026-10-24' } }, 's', 'me@x.test', true);
    expect(allDay).toMatchObject({ key: 's:a', allDay: true, title: 'AL', editable: true, googleId: 'a' });
    expect(allDay.start).toEqual(new Date(2026, 9, 22));
    expect(allDay.end).toEqual(new Date(2026, 9, 24));

    const timed = toCalEvent(
      { id: 'b', start: { dateTime: '2026-10-27T09:00:00+08:00' }, end: { dateTime: '2026-10-27T10:00:00+08:00' }, recurringEventId: 'r', organizer: { email: 'boss@x.test' } },
      's',
      'me@x.test',
      true,
    );
    expect(timed.title).toBe('(No title)');
    expect(timed.allDay).toBe(false);
    expect(timed.end.getTime() - timed.start.getTime()).toBe(3_600_000);
    expect(timed.recurring).toBe(true);
    expect(timed.editable).toBe(false); // someone else's invitation

    const readOnly = toCalEvent({ id: 'c', start: { date: '2026-01-01' }, end: { date: '2026-01-02' }, organizer: { self: true } }, 's', 'me@x.test', false);
    expect(readOnly.editable).toBe(false);
  });

  it('sends all-day events as dates (end = the day after) and timed ones with the time zone', () => {
    const allDay = toGoogleBody({ title: ' AL ', allDay: true, start: new Date(2026, 9, 22), end: new Date(2026, 9, 24), location: '', description: '' });
    expect(allDay).toMatchObject({ summary: 'AL', start: { date: '2026-10-22' }, end: { date: '2026-10-24' } });
    const start = new Date(2026, 9, 27, 9, 30);
    const timed = toGoogleBody({ title: 'Call', allDay: false, start, end: new Date(2026, 9, 27, 10), location: 'Room 1', description: '' });
    expect(timed.start).toEqual({ dateTime: start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    expect(timed.location).toBe('Room 1');
  });
});

describe('Google Calendar API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pages through events and leaves out cancelled ones', async () => {
    const pages = [
      { items: [{ id: '1', start: { date: '2026-01-01' }, end: { date: '2026-01-02' } }], nextPageToken: 'p2' },
      { items: [{ id: '2', status: 'cancelled', start: { date: '2026-01-03' }, end: { date: '2026-01-04' } }] },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const items = await listEvents('tok', 'me@x.test', new Date(2026, 0, 1), new Date(2027, 0, 1));
    expect(items.map((e) => e.id)).toEqual(['1']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toContain('/calendars/me%40x.test/events?');
    expect(url).toContain('pageToken=p2');
    expect(url).toContain('singleEvents=true');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('reports an expired token so it can be renewed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(listEvents('old', 'c', new Date(), new Date())).rejects.toBeInstanceOf(TokenRejected);
  });
});
