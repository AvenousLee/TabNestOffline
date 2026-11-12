import { describe, expect, it } from 'vitest';
import { parseColor } from './colors';

describe('colour codes', () => {
  it('reads hex in long and short form, with or without #', () => {
    expect(parseColor('#3A7BD5')).toBe('#3a7bd5');
    expect(parseColor('3a7bd5')).toBe('#3a7bd5');
    expect(parseColor(' #37d ')).toBe('#3377dd');
  });

  it('reads rgb and plain number lists, ignoring transparency', () => {
    expect(parseColor('rgb(58, 123, 213)')).toBe('#3a7bd5');
    expect(parseColor('rgba(58,123,213,0.5)')).toBe('#3a7bd5');
    expect(parseColor('rgb(58 123 213 / 50%)')).toBe('#3a7bd5');
    expect(parseColor('58, 123, 213')).toBe('#3a7bd5');
    expect(parseColor('0,0,0')).toBe('#000000');
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'blue', '#12', '#12345', '#ggg', 'rgb(256, 0, 0)', 'rgb(1, 2)', 'rgb(1,2,3', '1,2,3)']) expect(parseColor(bad)).toBeNull();
  });
});
