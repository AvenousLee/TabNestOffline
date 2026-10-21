// Linked calendars and their downloaded data. Kept on this device only:
//   calsources        CalendarSource[]               every linked calendar, for all calendar spaces
//   calcache:<id>     { fetchedAt, text }            last downloaded .ics for one calendar

import { create } from 'zustand';
import type { CalendarSource, CalendarView, CalEvent } from './types';
import { loadKey, removeKeys, saveKey } from '../storage/storage';
import { newId, nowIso } from '../lib/util';
import { normalizeIcalUrl, occurrences, parseIcs, type ParsedCalendar } from './ics';

/** Re-download a calendar when the space is opened and its copy is older than this. */
export const REFRESH_MS = 15 * 60 * 1000;
export const CAL_COLORS = ['#e8a33d', '#3dae7a', '#4c7bd6', '#d64c78', '#8a5cd6', '#3aa6b9', '#d6604c', '#8c8c96'];

interface Cache {
  fetchedAt: string;
  text: string;
}

interface CalState {
  loaded: boolean;
  sources: CalendarSource[];
  parsed: Record<string, ParsedCalendar>;
  busy: Record<string, boolean>;
  /** Remembered while TabNest is open. */
  view?: { view: CalendarView; date: string };

  load(): Promise<void>;
  addIcal(url: string, name?: string): Promise<CalendarSource>;
  updateSource(id: string, patch: Partial<Pick<CalendarSource, 'name' | 'color' | 'enabled' | 'url'>>): void;
  removeSource(id: string): void;
  refresh(id: string, force?: boolean): Promise<void>;
  refreshAll(force?: boolean): Promise<void>;
  setView(view: CalendarView, date: Date): void;
  /** Events of the shown calendars in [from, to). */
  eventsFor(from: Date, to: Date): CalEvent[];
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

export const useCalendar = create<CalState>()((set, get) => {
  const patchSource = (id: string, patch: Partial<CalendarSource>) => {
    const sources = get().sources.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sources });
    persistSources(sources);
  };

  return {
    loaded: false,
    sources: [],
    parsed: {},
    busy: {},

    async load() {
      if (get().loaded) return;
      // Older test builds kept calendars per space; they all belong on the one Calendar page now.
      const sources = ((await loadKey<CalendarSource[]>('calsources')) ?? []).map((s) => ({ ...s, group: s.group ?? 'other' }));
      const parsed: Record<string, ParsedCalendar> = {};
      for (const s of sources) {
        const cache = await loadKey<Cache>(`calcache:${s.id}`);
        if (cache) {
          try {
            parsed[s.id] = parseIcs(cache.text);
          } catch {
            /* stale cache, re-downloaded on refresh */
          }
        }
      }
      set({ loaded: true, sources, parsed });
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
      const old = get().sources.find((s) => s.id === id);
      patchSource(id, patch.url ? { ...patch, url: normalizeIcalUrl(patch.url) } : patch);
      if (old && patch.url && normalizeIcalUrl(patch.url) !== old.url) void get().refresh(id, true);
    },

    removeSource(id) {
      const sources = get().sources.filter((s) => s.id !== id);
      set((st) => {
        const parsed = { ...st.parsed };
        delete parsed[id];
        return { sources, parsed };
      });
      persistSources(sources);
      void removeKeys([`calcache:${id}`]);
    },

    async refresh(id, force = false) {
      const s = get().sources.find((x) => x.id === id);
      if (!s || get().busy[id]) return;
      const age = s.lastFetchedAt ? Date.now() - new Date(s.lastFetchedAt).getTime() : Infinity;
      if (!force && age < REFRESH_MS && get().parsed[id]) return;
      set((st) => ({ busy: { ...st.busy, [id]: true } }));
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
        set((st) => ({ busy: { ...st.busy, [id]: false } }));
      }
    },

    async refreshAll(force = false) {
      await Promise.all(get().sources.map((s) => get().refresh(s.id, force)));
    },

    setView(view, date) {
      set({ view: { view, date: date.toISOString() } });
    },

    eventsFor(from, to) {
      const st = get();
      return st.sources
        .filter((s) => s.enabled && st.parsed[s.id])
        .flatMap((s) => occurrences(st.parsed[s.id], s.id, from, to))
        .sort((a, b) => a.start.getTime() - b.start.getTime() || Number(b.allDay) - Number(a.allDay));
    },
  };
});
