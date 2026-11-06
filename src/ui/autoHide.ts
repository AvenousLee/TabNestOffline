// Opened hidden or locked card descriptions close again on their own, like a
// screen lock: after a while without mouse or keyboard use, and (if chosen)
// as soon as the tab is left. App runs the timer; each opened description listens.

import { useEffect } from 'react';
import type { Prefs } from '../types';

/** Minutes of inactivity before opened descriptions close (0 = never). */
export const AUTO_HIDE_CHOICES = [0, 1, 5, 15, 30] as const;
export const DEFAULT_AUTO_HIDE = 5;

export const autoHideMinutes = (p: Prefs) => p.noteAutoHideMinutes ?? DEFAULT_AUTO_HIDE;
export const autoHideOnLeave = (p: Prefs) => p.noteAutoHideOnLeave ?? true;

const listeners = new Set<() => void>();

/** Called when opened descriptions should close. Returns a function that stops listening. */
export function onAutoHide(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function hideOpenedNow(): void {
  listeners.forEach((cb) => cb());
}

/** True once `idleMs` has passed since the last activity (0 = never). */
export const isIdle = (lastActivity: number, now: number, idleMs: number) => idleMs > 0 && now - lastActivity >= idleMs;

/** Runs the inactivity timer for the whole page. */
export function useAutoHide(minutes: number, onLeave: boolean): void {
  useEffect(() => {
    let last = Date.now();
    let fired = false;
    const active = () => {
      last = Date.now();
      fired = false;
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true }));
    const timer = window.setInterval(() => {
      if (!fired && isIdle(last, Date.now(), minutes * 60_000)) {
        fired = true;
        hideOpenedNow();
      }
    }, 5_000);
    const leave = () => {
      if (onLeave && document.visibilityState === 'hidden') hideOpenedNow();
    };
    document.addEventListener('visibilitychange', leave);
    return () => {
      events.forEach((e) => window.removeEventListener(e, active));
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', leave);
    };
  }, [minutes, onLeave]);
}
