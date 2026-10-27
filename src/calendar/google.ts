// Google Calendar for "My calendars": sign-in and the Calendar API.
//
// Sign-in uses chrome.identity.launchWebAuthFlow (not getAuthToken), so any
// Google account can be added, several at once, not only the one Chrome is
// signed in with. It asks for a short-lived access token (about 1 hour) and
// renews it silently with the account's email as a hint while the user is
// still signed in to Google in this browser.

import type { CalEvent } from './types';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** Signing in again with a click is needed (silent renewal failed). */
export class NeedsSignIn extends Error {
  constructor(email: string) {
    super(`Sign in to ${email} again to see and edit its calendars.`);
  }
}

export const canUseGoogle = () => typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow;

/** Address to add as an "Authorised redirect URI" in Google Cloud. */
export const redirectUri = () => (canUseGoogle() ? chrome.identity.getRedirectURL() : '');

export function buildAuthUrl(o: { clientId: string; redirectUri: string; loginHint?: string; silent?: boolean }): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'token',
    scope: GOOGLE_SCOPES.join(' '),
    include_granted_scopes: 'true',
  });
  // Silent renewal shows nothing; adding an account lets the user pick which one.
  if (o.silent) p.set('prompt', 'none');
  else if (!o.loginHint) p.set('prompt', 'select_account');
  if (o.loginHint) p.set('login_hint', o.loginHint);
  return `${AUTH_URL}?${p}`;
}

/** Read the token from the address Google sends the sign-in window back to. */
export function parseAuthResponse(responseUrl: string, now = Date.now()): GoogleToken {
  const u = new URL(responseUrl);
  const p = new URLSearchParams(u.hash.slice(1) || u.search.slice(1));
  const err = p.get('error');
  if (err) {
    if (err === 'access_denied') throw new Error('Google sign-in was cancelled or access was not allowed.');
    throw new Error(`Google sign-in failed (${err}).`);
  }
  const token = p.get('access_token');
  if (!token) throw new Error('Google sign-in did not return a token.');
  const granted = (p.get('scope') ?? '').split(' ');
  if (p.get('scope') && !GOOGLE_SCOPES.every((s) => granted.includes(s))) {
    throw new Error('Please tick both calendar boxes on the Google permission page, so TabNest can show and edit your events.');
  }
  return { accessToken: token, expiresAt: now + Number(p.get('expires_in') ?? 3600) * 1000 };
}

export async function googleSignIn(clientId: string, opts: { loginHint?: string; interactive: boolean }): Promise<GoogleToken> {
  if (!canUseGoogle()) throw new Error('Google sign-in works in the installed TabNest extension (not in this preview).');
  const url = buildAuthUrl({ clientId, redirectUri: redirectUri(), loginHint: opts.loginHint, silent: !opts.interactive });
  let response: string | undefined;
  try {
    response = await chrome.identity.launchWebAuthFlow({ url, interactive: opts.interactive });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/did not approve|closed|cancel/i.test(msg)) throw new Error('Google sign-in was cancelled.');
    if (/could not be loaded/i.test(msg)) throw new Error('Google sign-in could not start. Check the client ID and that the redirect address is added in Google Cloud.');
    throw new Error(`Google sign-in failed: ${msg}`);
  }
  if (!response) throw new Error('Google sign-in was cancelled.');
  return parseAuthResponse(response);
}

/** Forget a token at Google too (best effort). */
export function revokeToken(token: string): void {
  void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}

/** The token was refused (expired or revoked): get a new one and try again. */
export class TokenRejected extends Error {}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach Google Calendar. Check your network / VPN.');
  }
  if (res.status === 401) throw new TokenRejected('Google sign-in expired.');
  if (res.status === 204 || res.status === 410) return undefined as T; // deleted (410: already gone)
  if (!res.ok) {
    let msg = '';
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      /* not JSON */
    }
    if (res.status === 403) throw new Error(`Google refused this (${msg || 'no permission'}). You may only have view access to this calendar.`);
    throw new Error(`Google Calendar answered ${res.status}${msg ? `: ${msg}` : ''}.`);
  }
  return (await res.json()) as T;
}

export interface GoogleCalendarEntry {
  id: string;
  summary: string;
  summaryOverride?: string;
  primary?: boolean;
  hidden?: boolean;
  selected?: boolean;
  backgroundColor?: string;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
}

export async function listCalendars(token: string): Promise<GoogleCalendarEntry[]> {
  const out: GoogleCalendarEntry[] = [];
  let pageToken = '';
  do {
    const page = await api<{ items?: GoogleCalendarEntry[]; nextPageToken?: string }>(token, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

type GTime = { date?: string; dateTime?: string; timeZone?: string };

export interface GoogleEvent {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start: GTime;
  end: GTime;
  recurringEventId?: string;
  organizer?: { email?: string; self?: boolean };
}

/** All event occurrences (repeats expanded) in [from, to). */
export async function listEvents(token: string, calendarId: string, from: Date, to: Date): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', maxResults: '2500' });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await api<{ items?: GoogleEvent[]; nextPageToken?: string }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);
  return out.filter((e) => e.status !== 'cancelled');
}

/** "2026-10-27" → local midnight. */
function localDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function toCalEvent(e: GoogleEvent, sourceId: string, calendarId: string, canWrite: boolean): CalEvent {
  const allDay = !!e.start.date;
  const start = allDay ? localDate(e.start.date!) : new Date(e.start.dateTime!);
  const end = allDay ? localDate(e.end.date ?? e.start.date!) : new Date(e.end.dateTime ?? e.start.dateTime!);
  // Only the organiser's copy can be changed; invitations from others are view only.
  const ownCopy = !e.organizer || !!e.organizer.self || e.organizer.email === calendarId;
  return {
    key: `${sourceId}:${e.id}`,
    uid: e.iCalUID ?? e.id,
    sourceId,
    title: e.summary || '(No title)',
    start,
    end: end > start ? end : new Date(start.getTime() + (allDay ? 86_400_000 : 0)),
    allDay,
    location: e.location,
    description: e.description,
    url: e.hangoutLink,
    googleId: e.id,
    htmlLink: e.htmlLink,
    recurring: !!e.recurringEventId,
    editable: canWrite && ownCopy,
  };
}

/** What the event form edits. For all-day events `end` is exclusive (the day after the last day). */
export interface EventDraft {
  title: string;
  allDay: boolean;
  start: Date;
  end: Date;
  location: string;
  description: string;
}

export function toGoogleBody(d: EventDraft): Partial<GoogleEvent> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    summary: d.title.trim(),
    location: d.location.trim(),
    description: d.description.trim(),
    start: d.allDay ? { date: dateString(d.start) } : { dateTime: d.start.toISOString(), timeZone },
    end: d.allDay ? { date: dateString(d.end) } : { dateTime: d.end.toISOString(), timeZone },
  };
}

const eventPath = (calendarId: string, eventId?: string) => `/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ''}`;

export const insertEvent = (token: string, calendarId: string, d: EventDraft) =>
  api<GoogleEvent>(token, eventPath(calendarId), { method: 'POST', body: JSON.stringify(toGoogleBody(d)) });

export const patchEvent = (token: string, calendarId: string, eventId: string, d: EventDraft) =>
  api<GoogleEvent>(token, eventPath(calendarId, eventId), { method: 'PATCH', body: JSON.stringify(toGoogleBody(d)) });

export const moveEvent = (token: string, calendarId: string, eventId: string, toCalendarId: string) =>
  api<GoogleEvent>(token, `${eventPath(calendarId, eventId)}/move?destination=${encodeURIComponent(toCalendarId)}`, { method: 'POST' });

export const deleteEvent = (token: string, calendarId: string, eventId: string) => api<void>(token, eventPath(calendarId, eventId), { method: 'DELETE' });
