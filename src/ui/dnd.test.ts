import { describe, expect, it } from 'vitest';
import { reorderIndex } from './dnd';

// Spaces A, B, C, D (index 0..3). moveSpace takes the new index in the list without the dragged space.
const move = (list: string[], from: number, over: number, after: boolean) => {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(reorderIndex(from, over, after), 0, x);
  return out.join('');
};

describe('reordering by dragging', () => {
  it('drops above or below the space under the pointer', () => {
    expect(move(['A', 'B', 'C', 'D'], 0, 2, false)).toBe('BACD'); // A above C
    expect(move(['A', 'B', 'C', 'D'], 0, 2, true)).toBe('BCAD'); // A below C
    expect(move(['A', 'B', 'C', 'D'], 3, 0, false)).toBe('DABC'); // D to the top
    expect(move(['A', 'B', 'C', 'D'], 0, 3, true)).toBe('BCDA'); // A to the bottom
    expect(move(['A', 'B', 'C', 'D'], 2, 1, true)).toBe('ABCD'); // C just below B: no change
  });
});
