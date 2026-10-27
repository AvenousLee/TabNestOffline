import { useState } from 'react';
import type { CalEvent } from '../../calendar/types';
import { useCalendar } from '../../calendar/calStore';
import { addDays } from '../../calendar/dates';
import { dateString, type EventDraft } from '../../calendar/google';
import { Field, Modal } from '../Modal';

const pad = (n: number) => String(n).padStart(2, '0');
const timeString = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function combine(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/** New event at the next full hour of `day` (09:00 on other days than today), one hour long. */
function defaultTimes(day: Date): [Date, Date] {
  const now = new Date();
  const isToday = day.toDateString() === now.toDateString();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isToday ? Math.min(now.getHours() + 1, 23) : 9);
  return [start, new Date(start.getTime() + 3_600_000)];
}

/** Create a new event, or change one, in a Google calendar the user can edit. */
export function EventForm({ event, day, onClose }: { event?: CalEvent; day?: Date; onClose: () => void }) {
  const cal = useCalendar();
  const current = event && cal.sources.find((s) => s.id === event.sourceId);
  // A changed event can move to another calendar of the same account (not a single occurrence of a repeating one).
  const targets = cal.sources.filter((s) => s.kind === 'google' && s.canEdit && (!current || (event!.recurring ? s.id === current.id : s.account === current.account)));
  const [defStart, defEnd] = event ? [event.start, event.end] : defaultTimes(day ?? new Date());
  const allDayEnd = event?.allDay ? addDays(event.end, -1) : defEnd;

  const [title, setTitle] = useState(event?.title === '(No title)' ? '' : (event?.title ?? ''));
  const [sourceId, setSourceId] = useState(current?.id ?? targets.find((s) => s.calendarId === s.account)?.id ?? targets[0]?.id ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startDate, setStartDate] = useState(dateString(defStart));
  const [startTime, setStartTime] = useState(timeString(defStart));
  const [endDate, setEndDate] = useState(dateString(allDay ? allDayEnd : defEnd));
  const [endTime, setEndTime] = useState(timeString(defEnd));
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [error, setError] = useState('');
  const signedOut = cal.accounts.find((a) => a.needsSignIn && a.email === targets.find((s) => s.id === sourceId)?.account);
  const [busy, setBusy] = useState(false);

  const start = allDay ? combine(startDate, '00:00') : combine(startDate, startTime);
  const end = allDay ? addDays(combine(endDate, '00:00'), 1) : combine(endDate, endTime);
  const datesOk = !!startDate && !!endDate && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start;

  // Moving the start keeps the length, like Google Calendar.
  const changeStart = (date: string, time: string) => {
    const length = end.getTime() - start.getTime();
    setStartDate(date);
    setStartTime(time);
    if (!date) return;
    const ns = allDay ? combine(date, '00:00') : combine(date, time);
    const ne = new Date(ns.getTime() + Math.max(length, allDay ? 86_400_000 : 0));
    setEndDate(dateString(allDay ? addDays(ne, -1) : ne));
    if (!allDay) setEndTime(timeString(ne));
  };

  const save = async () => {
    if (!datesOk || !sourceId) return;
    setError('');
    setBusy(true);
    const draft: EventDraft = { title: title.trim() || '(No title)', allDay, start, end, location, description };
    try {
      // Runs from a click, so Google may show its sign-in window here.
      if (signedOut) await cal.reconnectAccount(signedOut.email);
      if (event) await cal.updateEvent(event, draft, sourceId);
      else await cal.createEvent(sourceId, draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!datesOk || !sourceId || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : signedOut ? 'Sign in and save' : 'Save'}
          </button>
        </>
      }
    >
      {!targets.length ? (
        <div className="status-line warn">Add a Google account under “My calendars” first. Events are saved in your own Google calendars.</div>
      ) : (
        <form
          className="cal-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Title">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AL – Avenous" />
          </Field>
          <Field label="Calendar" hint={event?.recurring ? 'This is one occurrence of a repeating event: changes apply to this occurrence only.' : undefined}>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={targets.length < 2}>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.name !== s.account ? ` (${s.account})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
          </label>
          <div className="cal-form-when">
            <Field label="Starts">
              <div className="cal-form-row">
                <input type="date" value={startDate} onChange={(e) => changeStart(e.target.value, startTime)} />
                {!allDay && <input type="time" value={startTime} onChange={(e) => changeStart(startDate, e.target.value)} />}
              </div>
            </Field>
            <Field label="Ends">
              <div className="cal-form-row">
                <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
                {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />}
              </div>
            </Field>
          </div>
          {!datesOk && startDate && endDate && <div className="status-line warn">The end must be after the start.</div>}
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <button type="submit" hidden />
        </form>
      )}
      {error && <div className="status-line err">{error}</div>}
    </Modal>
  );
}
