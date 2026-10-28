import { describe, expect, it } from 'vitest';
import type { CalEvent } from './types';
import { agendaDays } from './agenda';

const ev = (key: string, start: Date, end: Date, allDay = false): CalEvent => ({ key, uid: key, sourceId: 's', title: key, start, end, allDay });
const days = (list: ReturnType<typeof agendaDays>) => list.map((d) => `${d.day.getDate()}: ${d.items.map((i) => `${i.e.key} ${i.when} ${i.day}/${i.days}`).join(', ')}`);

describe('agenda', () => {
  it('lists an all-day event from 1 to 5 Nov on each of its days', () => {
    const leave = ev('A', new Date(2026, 10, 1), new Date(2026, 10, 6), true);
    expect(days(agendaDays([leave], new Date(2026, 9, 28), 60))).toEqual(['1: A All day 1/5', '2: A All day 2/5', '3: A All day 3/5', '4: A All day 4/5', '5: A All day 5/5']);
  });

  it('starts at the first shown day for events that began earlier, and stops at the end of the range', () => {
    const leave = ev('A', new Date(2026, 10, 1), new Date(2026, 10, 6), true);
    expect(days(agendaDays([leave], new Date(2026, 10, 4), 60))).toEqual(['4: A All day 4/5', '5: A All day 5/5']);
    expect(days(agendaDays([leave], new Date(2026, 9, 30), 3))).toEqual(['1: A All day 1/5']);
  });

  it('shows start, all day and "until" for a timed event over several days', () => {
    const trip = ev('T', new Date(2026, 10, 1, 18, 0), new Date(2026, 10, 3, 9, 0));
    const out = agendaDays([trip], new Date(2026, 10, 1), 10);
    expect(out.map((d) => d.items[0].when)).toEqual([expect.stringMatching(/18|6/), 'All day', expect.stringMatching(/^until /)]);
  });

  it('does not put a meeting that ends at midnight on the next day', () => {
    const late = ev('L', new Date(2026, 10, 1, 22, 0), new Date(2026, 10, 2, 0, 0));
    expect(agendaDays([late], new Date(2026, 10, 1), 10).map((d) => d.day.getDate())).toEqual([1]);
  });

  it('puts all-day and continuing events before timed ones on a day', () => {
    const meeting = ev('M', new Date(2026, 10, 2, 9, 0), new Date(2026, 10, 2, 10, 0));
    const leave = ev('A', new Date(2026, 10, 1), new Date(2026, 10, 3), true);
    expect(agendaDays([meeting, leave], new Date(2026, 10, 2), 1)[0].items.map((i) => i.e.key)).toEqual(['A', 'M']);
  });
});
