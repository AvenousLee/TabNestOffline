import { describe, expect, it } from 'vitest';
import { autoHideMinutes, autoHideOnLeave, hideOpenedNow, isIdle, onAutoHide } from './autoHide';

describe('auto-hide of opened descriptions', () => {
  it('counts idle time from the last activity, and never with 0', () => {
    expect(isIdle(1000, 1000 + 4 * 60_000, 5 * 60_000)).toBe(false);
    expect(isIdle(1000, 1000 + 5 * 60_000, 5 * 60_000)).toBe(true);
    expect(isIdle(0, 10 ** 9, 0)).toBe(false);
  });

  it('defaults to 5 minutes and hiding when the tab is left', () => {
    expect(autoHideMinutes({ autoPreview: false })).toBe(5);
    expect(autoHideMinutes({ autoPreview: false, noteAutoHideMinutes: 0 })).toBe(0);
    expect(autoHideOnLeave({ autoPreview: false })).toBe(true);
    expect(autoHideOnLeave({ autoPreview: false, noteAutoHideOnLeave: false })).toBe(false);
  });

  it('tells every opened description to close, until it stops listening', () => {
    let calls = 0;
    const stop = onAutoHide(() => calls++);
    hideOpenedNow();
    stop();
    hideOpenedNow();
    expect(calls).toBe(1);
  });
});
