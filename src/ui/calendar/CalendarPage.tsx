import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarSource, CalendarView, CalEvent } from '../../calendar/types';
import { CAL_COLORS, useCalendar } from '../../calendar/calStore';
import { addDays, addMonths, coversDay, dayKey, fmt, monthGrid, sameDay, startOfDay, startOfWeek, weekStartDay } from '../../calendar/dates';
import { relativeTime } from '../../lib/util';
import { Icon } from '../icons';
import { AddCalendarDialog } from './AddCalendarDialog';
import { EventDetails } from './EventDetails';

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'agenda', label: 'Agenda' },
];
const AGENDA_DAYS = 60;

/** Date range a view needs events for. */
function rangeOf(view: CalendarView, d: Date): [Date, Date] {
  if (view === 'year') return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear() + 1, 0, 1)];
  if (view === 'month') {
    const g = monthGrid(d);
    return [g[0], addDays(g[41], 1)];
  }
  if (view === 'week') {
    const s = startOfWeek(d);
    return [s, addDays(s, 7)];
  }
  const s = startOfDay(d);
  return [s, addDays(s, AGENDA_DAYS)];
}

function step(view: CalendarView, d: Date, dir: 1 | -1): Date {
  if (view === 'year') return new Date(d.getFullYear() + dir, d.getMonth(), 1);
  if (view === 'month') return addMonths(d, dir);
  if (view === 'week') return addDays(d, 7 * dir);
  return addDays(d, AGENDA_DAYS * dir);
}

function titleOf(view: CalendarView, d: Date): string {
  if (view === 'year') return String(d.getFullYear());
  if (view === 'month') return fmt.monthYear(d);
  if (view === 'week') {
    const s = startOfWeek(d);
    return fmt.range(s, addDays(s, 6));
  }
  return fmt.range(d, addDays(d, AGENDA_DAYS - 1));
}

/** The one Calendar page: a calendar list on the left (like Google's) and the chosen view. */
export function CalendarPage() {
  const cal = useCalendar();
  const [view, setViewState] = useState<CalendarView>(cal.view?.view ?? 'month');
  const [date, setDate] = useState(() => (cal.view ? new Date(cal.view.date) : new Date()));
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const sources = cal.sources;
  const colorOf = useMemo(() => new Map(sources.map((s) => [s.id, s.color])), [sources]);
  const busy = sources.some((s) => cal.busy[s.id]);

  useEffect(() => {
    void cal.load().then(() => useCalendar.getState().refreshAll());
    const timer = setInterval(() => void useCalendar.getState().refreshAll(), 15 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (v: CalendarView, d: Date) => {
    setViewState(v);
    setDate(d);
    cal.setView(v, d);
  };

  const [from, to] = rangeOf(view, date);
  const events = useMemo(() => cal.eventsFor(from, to), [cal.parsed, cal.sources, from.getTime(), to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastFetch = sources.map((s) => s.lastFetchedAt).filter(Boolean).sort().pop();

  return (
    <main className="space-view calendar-page">
      <header className="space-head">
        <span className="space-dot big cal-page-icon">
          <Icon name="calendar" size={15} />
        </span>
        <span className="space-name">Calendar</span>
        <span className="meta">
          {sources.length ? `${sources.filter((s) => s.enabled).length} of ${sources.length} calendars shown` : 'No calendars linked yet'}
        </span>
      </header>

      <div className="cal-layout">
        <CalendarList sources={sources} onAdd={() => setAdding(true)} />

        <div className="cal">
          <div className="cal-toolbar">
            <button className="btn" onClick={() => go(view, new Date())}>
              Today
            </button>
            <button className="icon-btn" title="Previous" onClick={() => go(view, step(view, date, -1))}>
              <Icon name="left" />
            </button>
            <button className="icon-btn" title="Next" onClick={() => go(view, step(view, date, 1))}>
              <Icon name="right" />
            </button>
            <h2 className="cal-title">{titleOf(view, date)}</h2>
            <span className="grow" />
            <div className="seg">
              {VIEWS.map((v) => (
                <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => go(v.id, date)}>
                  {v.label}
                </button>
              ))}
            </div>
            <button className="icon-btn" title={`Refresh (updated ${relativeTime(lastFetch)})`} onClick={() => void cal.refreshAll(true)} disabled={busy || !sources.length}>
              <Icon name="sync" className={busy ? 'spin' : ''} />
            </button>
          </div>

          {/* The calendar always shows; linking calendars (list on the left) only adds their events to it. */}
          {/* Only this part scrolls; the header, calendar list and toolbar stay put. */}
          <div className={`cal-body${view === 'week' ? ' fill' : ''}`}>
          {view === 'year' ? (
            <YearView date={date} events={events} colorOf={colorOf} onDay={(d) => go('month', d)} />
          ) : view === 'month' ? (
            <MonthView date={date} events={events} colorOf={colorOf} onEvent={setSelected} onDay={(d) => go('week', d)} />
          ) : view === 'week' ? (
            <WeekView date={date} events={events} colorOf={colorOf} onEvent={setSelected} />
          ) : (
            <AgendaView from={from} events={events} colorOf={colorOf} onEvent={setSelected} />
          )}
          </div>
        </div>
      </div>

      {adding && <AddCalendarDialog onClose={() => setAdding(false)} />}
      {selected && <EventDetails event={selected} source={sources.find((s) => s.id === selected.sourceId)} onClose={() => setSelected(null)} />}
    </main>
  );
}

/** "My calendars" / "Other calendars" with colour checkboxes, like Google Calendar. */
function CalendarList({ sources, onAdd }: { sources: CalendarSource[]; onAdd: () => void }) {
  const [open, setOpen] = useState({ mine: true, other: true });
  const mine = sources.filter((s) => s.group === 'mine');
  const other = sources.filter((s) => s.group !== 'mine');
  const toggle = (k: 'mine' | 'other') => setOpen((o) => ({ ...o, [k]: !o[k] }));
  return (
    <aside className="cal-list">
      <div className="cal-list-head">
        <button className="cal-list-title" onClick={() => toggle('mine')}>
          My calendars
          <Icon name="chevron" size={14} className={open.mine ? 'flip' : ''} />
        </button>
      </div>
      {open.mine &&
        (mine.length ? (
          mine.map((s) => <CalendarRow key={s.id} s={s} />)
        ) : (
          <p className="cal-list-note">Sign in with Google to see and edit your own calendars here (coming next).</p>
        ))}

      <div className="cal-list-head">
        <button className="cal-list-title" onClick={() => toggle('other')}>
          Other calendars
          <Icon name="chevron" size={14} className={open.other ? 'flip' : ''} />
        </button>
        <button className="icon-btn" title="Link another calendar (iCal)" onClick={onAdd}>
          <Icon name="plus" size={15} />
        </button>
      </div>
      {open.other &&
        (other.length ? (
          other.map((s) => <CalendarRow key={s.id} s={s} />)
        ) : (
          <button className="cal-list-note link-btn" onClick={onAdd}>
            + Link a calendar (Google, Outlook, holidays…)
          </button>
        ))}
    </aside>
  );
}

function CalendarRow({ s }: { s: CalendarSource }) {
  const cal = useCalendar();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  return (
    <div className={`cal-row${s.lastError ? ' err' : ''}`} ref={ref}>
      <label className="cal-check" title={s.lastError ?? `Updated ${relativeTime(s.lastFetchedAt)}`}>
        <input type="checkbox" checked={s.enabled} onChange={() => cal.updateSource(s.id, { enabled: !s.enabled })} style={{ accentColor: s.color }} />
        <span className="cal-box" style={{ borderColor: s.color, background: s.enabled ? s.color : 'transparent' }}>
          {s.enabled && <Icon name="check" size={11} />}
        </span>
        {renaming ? (
          <input
            className="inline-input"
            autoFocus
            defaultValue={s.name}
            onBlur={(e) => {
              if (e.target.value.trim()) cal.updateSource(s.id, { name: e.target.value.trim() });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(false);
            }}
          />
        ) : (
          <span className="cal-row-name">{s.name}</span>
        )}
        {s.lastError && <Icon name="alert" size={12} className="err-text" />}
        {cal.busy[s.id] && <Icon name="sync" size={12} className="spin" />}
      </label>
      <button className="icon-btn cal-row-more" title="Options" onClick={() => setMenu(!menu)}>
        <Icon name="more" size={14} />
      </button>
      {menu && (
        <div className="cal-menu">
          <div className="swatches">
            {CAL_COLORS.map((c) => (
              <button key={c} className={`swatch small${c === s.color ? ' on' : ''}`} style={{ background: c }} onClick={() => cal.updateSource(s.id, { color: c })} aria-label={c} />
            ))}
          </div>
          {s.lastError && <p className="err-text small">{s.lastError}</p>}
          <button onClick={() => (setRenaming(true), setMenu(false))}>Rename</button>
          <button onClick={() => (void cal.refresh(s.id, true), setMenu(false))}>Refresh now</button>
          <button
            onClick={() => {
              setMenu(false);
              const next = prompt('New iCal address for this calendar (e.g. after the secret address was reset):', s.url);
              if (next && next.trim()) cal.updateSource(s.id, { url: next.trim() });
            }}
          >
            Replace link…
          </button>
          <button className="danger" onClick={() => (setMenu(false), confirm(`Remove “${s.name}” from TabNest? (It is not deleted in Google/Outlook.)`) && cal.removeSource(s.id))}>
            Remove
          </button>
          <p className="muted small">View only · updated {relativeTime(s.lastFetchedAt)}</p>
        </div>
      )}
    </div>
  );
}

type ViewProps = { events: CalEvent[]; colorOf: Map<string, string>; onEvent: (e: CalEvent) => void };

function EventChip({ e, color, onEvent, continued }: { e: CalEvent; color?: string; onEvent: (e: CalEvent) => void; continued?: boolean }) {
  return (
    <button
      className={`cal-ev${e.allDay ? ' allday' : ''}${continued ? ' cont' : ''}`}
      style={{ ['--ev' as string]: color ?? '#888' }}
      title={`${e.title}${e.location ? ` · ${e.location}` : ''}`}
      onClick={(ev) => {
        ev.stopPropagation();
        onEvent(e);
      }}
    >
      {!e.allDay && <span className="cal-ev-time">{fmt.time(e.start)}</span>}
      <span className="cal-ev-title">{e.title}</span>
    </button>
  );
}

const MAX_IN_CELL = 3;

function MonthView({ date, events, colorOf, onEvent, onDay }: ViewProps & { date: Date; onDay: (d: Date) => void }) {
  const days = monthGrid(date);
  const today = new Date();
  return (
    <div className="cal-month">
      {days.slice(0, 7).map((d) => (
        <div key={`h${d.getDay()}`} className="cal-dow">
          {fmt.weekday(d)}
        </div>
      ))}
      {days.map((d) => {
        const list = events.filter((e) => coversDay(e.start, e.end, d));
        const extra = list.length - MAX_IN_CELL;
        return (
          <div
            key={dayKey(d)}
            className={`cal-cell${d.getMonth() !== date.getMonth() ? ' other' : ''}${sameDay(d, today) ? ' today' : ''}`}
            onDoubleClick={() => onDay(d)}
          >
            <span className="cal-daynum">{d.getDate()}</span>
            {list.slice(0, extra > 0 ? MAX_IN_CELL - 1 : MAX_IN_CELL).map((e) => (
              <EventChip key={e.key} e={e} color={colorOf.get(e.sourceId)} onEvent={onEvent} continued={!sameDay(e.start, d) && e.start < d} />
            ))}
            {extra > 0 && (
              <button className="cal-more" onClick={() => onDay(d)}>
                +{extra + 1} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const HOUR_PX = 44;

/** Lay out overlapping timed events side by side. */
function columns(list: CalEvent[]): Array<{ e: CalEvent; col: number; cols: number }> {
  const out: Array<{ e: CalEvent; col: number; cols: number }> = [];
  let group: typeof out = [];
  let groupEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    group.forEach((g) => (g.cols = cols));
    out.push(...group);
    group = [];
  };
  for (const e of [...list].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (group.length && e.start.getTime() >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.e.end > e.start).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ e, col, cols: 1 });
    groupEnd = Math.max(groupEnd, e.end.getTime());
  }
  flush();
  return out;
}

function WeekView({ date, events, colorOf, onEvent }: ViewProps & { date: Date }) {
  const start = startOfWeek(date, weekStartDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scroller) scroller.scrollTop = 7.5 * HOUR_PX; // start around 7:30
  }, [scroller]);

  return (
    <div className="cal-week">
      <div className="cal-week-head">
        <div className="cal-gutter" />
        {days.map((d) => (
          <div key={dayKey(d)} className={`cal-week-day${sameDay(d, today) ? ' today' : ''}`}>
            <span>{fmt.weekday(d)}</span> <b>{d.getDate()}</b>
          </div>
        ))}
      </div>
      <div className="cal-week-allday">
        <div className="cal-gutter small">all day</div>
        {days.map((d) => (
          <div key={dayKey(d)} className="cal-week-allcell">
            {events
              .filter((e) => (e.allDay || e.end.getTime() - e.start.getTime() >= 86_400_000) && coversDay(e.start, e.end, d))
              .map((e) => (
                <EventChip key={e.key} e={{ ...e, allDay: true }} color={colorOf.get(e.sourceId)} onEvent={() => onEvent(e)} continued={e.start < startOfDay(d)} />
              ))}
          </div>
        ))}
      </div>
      <div className="cal-week-body" ref={setScroller}>
        <div className="cal-hours">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="cal-hour" style={{ height: HOUR_PX }}>
              {h ? new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }) : ''}
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayStart = startOfDay(d).getTime();
          const timed = events.filter((e) => !e.allDay && e.end.getTime() - e.start.getTime() < 86_400_000 && coversDay(e.start, e.end, d));
          return (
            <div key={dayKey(d)} className={`cal-week-col${sameDay(d, today) ? ' today' : ''}`} style={{ height: 24 * HOUR_PX }}>
              {columns(timed).map(({ e, col, cols }) => {
                const top = Math.max(0, (e.start.getTime() - dayStart) / 3_600_000) * HOUR_PX;
                const bottom = Math.min(24, (e.end.getTime() - dayStart) / 3_600_000) * HOUR_PX;
                return (
                  <button
                    key={e.key}
                    className={`cal-block${bottom - top < HOUR_PX * 0.75 ? ' short' : ''}`}
                    style={{ top, height: Math.max(18, bottom - top - 2), left: `${(col / cols) * 100}%`, width: `${100 / cols}%`, ['--ev' as string]: colorOf.get(e.sourceId) ?? '#888' }}
                    onClick={() => onEvent(e)}
                    title={e.title}
                  >
                    {bottom - top < HOUR_PX * 0.75 ? (
                      <span className="one-line">
                        {fmt.time(e.start)} <b>{e.title}</b>
                      </span>
                    ) : (
                      <>
                        <b>{e.title}</b>
                        <span>{fmt.time(e.start)}</span>
                      </>
                    )}
                  </button>
                );
              })}
              {sameDay(d, today) && <div className="cal-now" style={{ top: ((Date.now() - dayStart) / 3_600_000) * HOUR_PX }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ from, events, colorOf, onEvent }: ViewProps & { from: Date }) {
  const byDay = new Map<string, { day: Date; list: CalEvent[] }>();
  for (const e of events) {
    // Multi-day events are listed on their first visible day (e.g. leave that started yesterday shows today).
    const day = startOfDay(e.start < from ? from : e.start);
    const k = dayKey(day);
    if (!byDay.has(k)) byDay.set(k, { day, list: [] });
    byDay.get(k)!.list.push(e);
  }
  if (!byDay.size) return <p className="empty">No events in the next {AGENDA_DAYS} days.</p>;
  return (
    <div className="cal-agenda">
      {[...byDay.values()].map(({ day, list }) => (
        <section key={dayKey(day)} className={sameDay(day, new Date()) ? 'today' : ''}>
          <h3>{fmt.dayLong(day)}</h3>
          {list.map((e) => (
            <button key={e.key} className="cal-agenda-row" onClick={() => onEvent(e)}>
              <span className="cal-swatch" style={{ background: colorOf.get(e.sourceId) }} />
              <span className="cal-agenda-time">{e.allDay ? (addDays(e.end, -1) > e.start ? `until ${addDays(e.end, -1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'All day') : fmt.time(e.start)}</span>
              <b>{e.title}</b>
              {e.location && <span className="muted small">{e.location}</span>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function YearView({ date, events, colorOf, onDay }: { date: Date; events: CalEvent[]; colorOf: Map<string, string>; onDay: (d: Date) => void }) {
  const today = new Date();
  // Colours of the calendars with something on each day.
  const marks = new Map<string, string[]>();
  for (const e of events) {
    for (let d = startOfDay(e.start); d < e.end; d = addDays(d, 1)) {
      if (d.getFullYear() !== date.getFullYear()) continue;
      const k = dayKey(d);
      const c = colorOf.get(e.sourceId) ?? '#888';
      const arr = marks.get(k) ?? [];
      if (!arr.includes(c)) arr.push(c);
      marks.set(k, arr);
    }
  }
  return (
    <div className="cal-year">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(date.getFullYear(), m, 1);
        const grid = monthGrid(first);
        return (
          <div key={m} className="cal-mini">
            <button className="cal-mini-title" onClick={() => onDay(first)}>
              {fmt.monthLong(first)}
            </button>
            <div className="cal-mini-grid">
              {grid.slice(0, 7).map((d) => (
                <span key={`h${d.getDay()}`} className="cal-mini-dow">
                  {fmt.weekday(d).charAt(0)}
                </span>
              ))}
              {grid.map((d) => {
                const k = dayKey(d);
                const inMonth = d.getMonth() === m;
                const dots = inMonth ? marks.get(k) : undefined;
                return (
                  <button
                    key={k}
                    className={`cal-mini-day${inMonth ? '' : ' other'}${sameDay(d, today) ? ' today' : ''}${dots ? ' has' : ''}`}
                    onClick={() => inMonth && onDay(d)}
                    title={dots ? `${dots.length} calendar(s) have events` : undefined}
                    style={dots ? { ['--ev' as string]: dots[0] } : undefined}
                  >
                    {inMonth ? d.getDate() : ''}
                    {dots && (
                      <span className="cal-dots">
                        {dots.slice(0, 3).map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
