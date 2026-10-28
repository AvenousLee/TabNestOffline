// Linked calendars and their downloaded data. Kept on this device only:
//   calsources        CalendarSource[]               every calendar on the Calendar page
//   calcache:<id>     { fetchedAt, text }            last downloaded .ics for one iCal calendar
//   calaccounts       GoogleAccount[]                signed-in Google accounts
//   calgoogle         { clientId }                   the Google Cloud OAuth client to sign in with
//   calgtoken:<email> GoogleToken                    short-lived access token (about 1 hour)
//   calgcache:<id>    { [year]: { fetchedAt, items } } last downloaded events of one Google calendar

import { create } from 'zustand';
import type { CalendarSource, CalendarView, CalEvent, GoogleAccount } from './types';
import { loadKey, removeKeys, saveKey } from '../storage/storage';
import { newId, nowIso } from '../lib/util';
import { normalizeIcalUrl, occurrences, parseIcs, type ParsedCalendar } from './ics';
import {
  deleteEvent,
  googleSignIn,
  insertEvent,
  listCalendars,
  listEvents,
  moveEvent,
  NeedsSignIn,
  patchEvent,
  revokeToken,
  toCalEvent,
  TokenRejected,
  type EventDraft,
  type GoogleCalendarEntry,
  type GoogleEvent,
  type GoogleToken,
} from './google';

/** Re-download a calendar when the page is opened and its copy is older than this. */
export const REFRESH_MS = 15 * 60 * 1000;
export const CAL_COLORS = ['#e8a33d', '#3dae7a', '#4c7bd6', '#d64c78', '#8a5cd6', '#3aa6b9', '#d6604c', '#8c8c96'];

interface Cache {
  fetchedAt: string;
  text: string;
}

type YearCache = Record<number, { fetchedAt: string; items: GoogleEvent[] }>;
type YearEvents = Record<number, { fetchedAt: string; events: CalEvent[] }>;

interface CalState {
  loaded: boolean;
  sources: CalendarSource[];
  parsed: Record<string, ParsedCalendar>;
  /** Google calendars: events per year, fetched as the views need them. */
  gyears: Record<string, YearEvents>;
  accounts: GoogleAccount[];
  clientId: string;
  busy: Record<string, boolean>;
  /** Remembered while TabNest is open. */
  view?: { view: CalendarView; date: string };

  load(): Promise<void>;
  addIcal(url: string, name?: string): Promise<CalendarSource>;
  updateSource(id: string, patch: Partial<Pick<CalendarSource, 'name' | 'color' | 'enabled'>>): void;
  /** Point an iCal calendar at a new address. Downloads it first, so a wrong link is reported and nothing changes. */
  changeIcalUrl(id: string, url: string): Promise<void>;
  removeSource(id: string): void;
  refresh(id: string, force?: boolean): Promise<void>;
  refreshAll(force?: boolean): Promise<void>;
  setView(view: CalendarView, date: Date): void;
  /** Events of the shown calendars in [from, to). */
  eventsFor(from: Date, to: Date): CalEvent[];
  /** Download Google events the views need for [from, to). */
  ensureRange(from: Date, to: Date): Promise<void>;

  setClientId(clientId: string): void;
  /** Pick a Google account in Google's window. Its calendars are added with setAccountCalendars. */
  addGoogleAccount(): Promise<{ account: GoogleAccount; calendars: GoogleCalendarEntry[] }>;
  /** Every calendar the account can read events of (for choosing which to show). */
  accountCalendars(email: string): Promise<GoogleCalendarEntry[]>;
  /** Show exactly these calendars of the account: adds the new ones, removes the others. */
  setAccountCalendars(email: string, calendars: GoogleCalendarEntry[], chosenIds: string[]): void;
  reconnectAccount(email: string): Promise<void>;
  removeAccount(email: string): void;
  createEvent(sourceId: string, draft: EventDraft): Promise<void>;
  updateEvent(event: CalEvent, draft: EventDraft, toSourceId: string): Promise<void>;
  deleteEvent(event: CalEvent): Promise<void>;
}

async function download(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new Error('Could not reach the calendar. Check the link and your network / VPN.');
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error(`The calendar link was refused (${res.status}). It may be private, expired or reset. Copy a fresh iCal address.`);
  }
  if (!res.ok) throw new Error(`The calendar server answered ${res.status}.`);
  return res.text();
}

const persistSources = (sources: CalendarSource[]) => void saveKey('calsources', sources);
const persistAccounts = (accounts: GoogleAccount[]) => void saveKey('calaccounts', accounts);

const yearsOf = (from: Date, to: Date) => {
  const out: number[] = [];
  for (let y = from.getFullYear(); y <= new Date(to.getTime() - 1).getFullYear(); y++) out.push(y);
  return out;
};
const yearRange = (y: number): [Date, Date] => [new Date(y, 0, 1), new Date(y + 1, 0, 1)];
const stale = (fetchedAt: string | undefined) => !fetchedAt || Date.now() - new Date(fetchedAt).getTime() >= REFRESH_MS;

export const useCalendar = create<CalState>()((set, get) => {
  const patchSource = (id: string, patch: Partial<CalendarSource>) => {
    const sources = get().sources.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sources });
    persistSources(sources);
  };
  const patchAccount = (email: string, patch: Partial<GoogleAccount>) => {
    const accounts = get().accounts.map((a) => (a.email === email ? { ...a, ...patch } : a));
    set({ accounts });
    persistAccounts(accounts);
  };
  const setBusy = (key: string, on: boolean) => set((st) => ({ busy: { ...st.busy, [key]: on } }));

  // --- Google tokens: memory, then storage, then silent renewal; a click is needed only when that fails.
  const tokens = new Map<string, GoogleToken>();
  const renewing = new Map<string, Promise<string>>();

  const saveToken = (email: string, t: GoogleToken) => {
    tokens.set(email, t);
    void saveKey(`calgtoken:${email}`, t);
  };

  async function tokenFor(email: string): Promise<string> {
    const valid = (t?: GoogleToken) => t && t.expiresAt - 60_000 > Date.now();
    let t = tokens.get(email);
    if (!valid(t)) {
      t = await loadKey<GoogleToken>(`calgtoken:${email}`);
      if (t) tokens.set(email, t);
    }
    if (valid(t)) return t!.accessToken;
    // One silent renewal per account at a time (several calendars ask together).
    let p = renewing.get(email);
    if (!p) {
      p = googleSignIn(get().clientId, { loginHint: email, interactive: false })
        .then((nt) => {
          saveToken(email, nt);
          if (get().accounts.find((a) => a.email === email)?.needsSignIn) patchAccount(email, { needsSignIn: false });
          return nt.accessToken;
        })
        .catch(() => {
          patchAccount(email, { needsSignIn: true });
          throw new NeedsSignIn(email);
        })
        .finally(() => renewing.delete(email));
      renewing.set(email, p);
    }
    return p;
  }

  /** Call the Google API with the account's token; one retry with a fresh token if Google refuses it. */
  async function withToken<T>(email: string, call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(await tokenFor(email));
    } catch (e) {
      if (!(e instanceof TokenRejected)) throw e;
      tokens.delete(email);
      void removeKeys([`calgtoken:${email}`]);
      return call(await tokenFor(email));
    }
  }

  const canWrite = (c: GoogleCalendarEntry) => c.accessRole === 'owner' || c.accessRole === 'writer';

  /** Update the edit rights of the account's chosen calendars. New calendars are only added when the user picks them. */
  async function syncCalendarList(email: string, token?: string): Promise<void> {
    const list = token ? await listCalendars(token) : await withToken(email, listCalendars);
    const sources = get().sources.map((s) => {
      const g = s.account === email && list.find((c) => c.id === s.calendarId);
      return g ? { ...s, canEdit: canWrite(g) } : s;
    });
    set({ sources });
    persistSources(sources);
  }

  async function fetchYear(s: CalendarSource, year: number): Promise<void> {
    const key = `${s.id}:${year}`;
    if (get().busy[key]) return;
    setBusy(key, true);
    try {
      const [from, to] = yearRange(year);
      const items = await withToken(s.account!, (t) => listEvents(t, s.calendarId!, from, to));
      const fetchedAt = nowIso();
      const events = items.map((e) => toCalEvent(e, s.id, s.calendarId!, !!s.canEdit));
      set((st) => ({ gyears: { ...st.gyears, [s.id]: { ...st.gyears[s.id], [year]: { fetchedAt, events } } } }));
      const cache = (await loadKey<YearCache>(`calgcache:${s.id}`)) ?? {};
      void saveKey(`calgcache:${s.id}`, { ...cache, [year]: { fetchedAt, items } } satisfies YearCache);
      patchSource(s.id, { lastFetchedAt: fetchedAt, lastError: undefined });
    } catch (e) {
      patchSource(s.id, { lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(key, false);
    }
  }

  /** Download again the years already shown for a Google calendar (this year if none). */
  async function refetchGoogle(s: CalendarSource, force: boolean): Promise<void> {
    const loaded = get().gyears[s.id] ?? {};
    const years = Object.keys(loaded).map(Number);
    if (!years.length) years.push(new Date().getFullYear());
    await Promise.all(years.filter((y) => force || stale(loaded[y]?.fetchedAt)).map((y) => fetchYear(s, y)));
  }

  const sourceOf = (id: string) => {
    const s = get().sources.find((x) => x.id === id);
    if (!s || s.kind !== 'google' || !s.account || !s.calendarId) throw new Error('This calendar is not a Google calendar.');
    return s;
  };
  /** After a change, show the new state of the years the event touches. */
  const reloadYears = (s: CalendarSource, ...dates: Date[]) => Promise.all([...new Set(dates.map((d) => d.getFullYear()))].map((y) => fetchYear(s, y)));

  return {
    loaded: false,
    sources: [],
    parsed: {},
    gyears: {},
    accounts: [],
    clientId: '',
    busy: {},

    async load() {
      if (get().loaded) return;
      // Older test builds kept calendars per space; they all belong on the one Calendar page now.
      const sources = ((await loadKey<CalendarSource[]>('calsources')) ?? []).map((s) => ({ ...s, group: s.group ?? 'other', kind: s.kind ?? 'ical' }));
      const parsed: Record<string, ParsedCalendar> = {};
      const gyears: Record<string, YearEvents> = {};
      for (const s of sources) {
        if (s.kind === 'google') {
          const cache = await loadKey<YearCache>(`calgcache:${s.id}`);
          if (cache)
            gyears[s.id] = Object.fromEntries(
              Object.entries(cache).map(([y, c]) => [y, { fetchedAt: c.fetchedAt, events: c.items.map((e) => toCalEvent(e, s.id, s.calendarId!, !!s.canEdit)) }]),
            );
          continue;
        }
        const cache = await loadKey<Cache>(`calcache:${s.id}`);
        if (cache) {
          try {
            parsed[s.id] = parseIcs(cache.text);
          } catch {
            /* stale cache, re-downloaded on refresh */
          }
        }
      }
      const accounts = (await loadKey<GoogleAccount[]>('calaccounts')) ?? [];
      const clientId = (await loadKey<{ clientId: string }>('calgoogle'))?.clientId ?? '';
      set({ loaded: true, sources, parsed, gyears, accounts, clientId });
    },

    async addIcal(rawUrl, name) {
      const url = normalizeIcalUrl(rawUrl);
      // Download first, so a wrong link is reported before anything is saved.
      const text = await download(url);
      const cal = parseIcs(text);
      const used = new Set(get().sources.map((s) => s.color));
      const source: CalendarSource = {
        id: newId(),
        group: 'other',
        name: name?.trim() || cal.name || new URL(url).hostname,
        color: CAL_COLORS.find((c) => !used.has(c)) ?? CAL_COLORS[0],
        enabled: true,
        kind: 'ical',
        url,
        lastFetchedAt: nowIso(),
      };
      void saveKey(`calcache:${source.id}`, { fetchedAt: source.lastFetchedAt ?? nowIso(), text } satisfies Cache);
      const sources = [...get().sources, source];
      set((st) => ({ sources, parsed: { ...st.parsed, [source.id]: cal } }));
      persistSources(sources);
      return source;
    },

    updateSource(id, patch) {
      patchSource(id, patch);
    },

    async changeIcalUrl(id, rawUrl) {
      const url = normalizeIcalUrl(rawUrl);
      if (get().sources.find((s) => s.id === id)?.url === url) return;
      const text = await download(url);
      const cal = parseIcs(text);
      const fetchedAt = nowIso();
      void saveKey(`calcache:${id}`, { fetchedAt, text } satisfies Cache);
      set((st) => ({ parsed: { ...st.parsed, [id]: cal } }));
      patchSource(id, { url, lastFetchedAt: fetchedAt, lastError: undefined });
    },

    removeSource(id) {
      const sources = get().sources.filter((s) => s.id !== id);
      set((st) => {
        const parsed = { ...st.parsed };
        const gyears = { ...st.gyears };
        delete parsed[id];
        delete gyears[id];
        return { sources, parsed, gyears };
      });
      persistSources(sources);
      void removeKeys([`calcache:${id}`, `calgcache:${id}`]);
    },

    async refresh(id, force = false) {
      const s = get().sources.find((x) => x.id === id);
      if (!s || get().busy[id]) return;
      if (s.kind === 'google') {
        if (!get().accounts.find((a) => a.email === s.account)?.needsSignIn) await refetchGoogle(s, force);
        return;
      }
      const age = s.lastFetchedAt ? Date.now() - new Date(s.lastFetchedAt).getTime() : Infinity;
      if (!force && age < REFRESH_MS && get().parsed[id]) return;
      setBusy(id, true);
      try {
        const text = await download(s.url);
        const cal = parseIcs(text);
        const fetchedAt = nowIso();
        void saveKey(`calcache:${id}`, { fetchedAt, text } satisfies Cache);
        set((st) => ({ parsed: { ...st.parsed, [id]: cal } }));
        patchSource(id, { lastFetchedAt: fetchedAt, lastError: undefined });
      } catch (e) {
        // Keep showing the last good copy; just note the problem.
        patchSource(id, { lastError: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(id, false);
      }
    },

    async refreshAll(force = false) {
      // New calendars in a Google account show up on a forced refresh (the ↻ button).
      if (force) await Promise.all(get().accounts.filter((a) => !a.needsSignIn).map((a) => syncCalendarList(a.email).catch(() => undefined)));
      await Promise.all(get().sources.map((s) => get().refresh(s.id, force)));
    },

    setView(view, date) {
      set({ view: { view, date: date.toISOString() } });
    },

    eventsFor(from, to) {
      const st = get();
      const seen = new Set<string>();
      const google = st.sources
        .filter((s) => s.enabled && s.kind === 'google')
        .flatMap((s) => yearsOf(from, to).flatMap((y) => st.gyears[s.id]?.[y]?.events ?? []))
        // An event across New Year comes with both years.
        .filter((e) => e.start < to && e.end > from && !seen.has(e.key) && !!seen.add(e.key));
      return st.sources
        .filter((s) => s.enabled && s.kind !== 'google' && st.parsed[s.id])
        .flatMap((s) => occurrences(st.parsed[s.id], s.id, from, to))
        .concat(google)
        .sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
    },

    async ensureRange(from, to) {
      const st = get();
      const needed = st.sources
        .filter((s) => s.enabled && s.kind === 'google' && !st.accounts.find((a) => a.email === s.account)?.needsSignIn)
        .flatMap((s) => yearsOf(from, to).filter((y) => stale(st.gyears[s.id]?.[y]?.fetchedAt)).map((y) => fetchYear(s, y)));
      await Promise.all(needed);
    },

    setClientId(clientId) {
      set({ clientId: clientId.trim() });
      void saveKey('calgoogle', { clientId: clientId.trim() });
    },

    async addGoogleAccount() {
      if (!get().clientId) throw new Error('Add the Google client ID first.');
      const t = await googleSignIn(get().clientId, { interactive: true });
      // The main calendar's id is the account's email address.
      const calendars = (await listCalendars(t.accessToken)).filter((c) => c.accessRole !== 'freeBusyReader');
      const primary = calendars.find((c) => c.primary);
      if (!primary) throw new Error('This Google account has no main calendar.');
      const email = primary.id;
      saveToken(email, t);
      const account: GoogleAccount = { email };
      const accounts = get().accounts.some((a) => a.email === email) ? get().accounts.map((a) => (a.email === email ? account : a)) : [...get().accounts, account];
      set({ accounts });
      persistAccounts(accounts);
      await syncCalendarList(email, t.accessToken);
      return { account, calendars };
    },

    async accountCalendars(email) {
      return (await withToken(email, listCalendars)).filter((c) => c.accessRole !== 'freeBusyReader');
    },

    setAccountCalendars(email, calendars, chosenIds) {
      const chosen = new Set(chosenIds);
      for (const s of get().sources.filter((x) => x.account === email && !chosen.has(x.calendarId!))) get().removeSource(s.id);
      const known = get().sources;
      const used = new Set(known.map((s) => s.color));
      const added: CalendarSource[] = calendars
        .filter((c) => chosen.has(c.id) && !known.some((s) => s.account === email && s.calendarId === c.id))
        .map((c) => ({
          id: newId(),
          group: 'mine',
          kind: 'google',
          url: '',
          account: email,
          calendarId: c.id,
          name: c.summaryOverride || (c.primary ? 'Main calendar' : c.summary),
          color: c.backgroundColor ?? CAL_COLORS.find((x) => !used.has(x)) ?? CAL_COLORS[0],
          enabled: true,
          canEdit: canWrite(c),
        }));
      if (!added.length) return;
      const sources = [...known, ...added];
      set({ sources });
      persistSources(sources);
    },

    async reconnectAccount(email) {
      const t = await googleSignIn(get().clientId, { loginHint: email, interactive: true });
      const primary = (await listCalendars(t.accessToken)).find((c) => c.primary);
      if (primary && primary.id !== email) throw new Error(`You signed in as ${primary.id}. Choose ${email} to reconnect it, or add ${primary.id} as another account.`);
      saveToken(email, t);
      patchAccount(email, { needsSignIn: false });
      await syncCalendarList(email, t.accessToken);
      await Promise.all(get().sources.filter((s) => s.account === email).map((s) => get().refresh(s.id, true)));
    },

    removeAccount(email) {
      const t = tokens.get(email);
      if (t) revokeToken(t.accessToken);
      tokens.delete(email);
      for (const s of get().sources.filter((x) => x.account === email)) get().removeSource(s.id);
      const accounts = get().accounts.filter((a) => a.email !== email);
      set({ accounts });
      persistAccounts(accounts);
      void removeKeys([`calgtoken:${email}`]);
    },

    async createEvent(sourceId, draft) {
      const s = sourceOf(sourceId);
      await withToken(s.account!, (t) => insertEvent(t, s.calendarId!, draft));
      await reloadYears(s, draft.start, draft.end);
    },

    async updateEvent(event, draft, toSourceId) {
      const from = sourceOf(event.sourceId);
      const to = sourceOf(toSourceId);
      if (from.account !== to.account) throw new Error('An event can only move to a calendar of the same Google account.');
      await withToken(from.account!, async (t) => {
        if (to.id !== from.id) await moveEvent(t, from.calendarId!, event.googleId!, to.calendarId!);
        await patchEvent(t, to.calendarId!, event.googleId!, draft);
      });
      await reloadYears(from, event.start, event.end);
      if (to.id !== from.id || draft.start.getFullYear() !== event.start.getFullYear()) await reloadYears(to, draft.start, draft.end);
    },

    async deleteEvent(event) {
      const s = sourceOf(event.sourceId);
      await withToken(s.account!, (t) => deleteEvent(t, s.calendarId!, event.googleId!));
      await reloadYears(s, event.start, event.end);
    },
  };
});
