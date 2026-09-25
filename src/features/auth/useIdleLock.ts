// Idle lock for the console. Activity in any tab counts (shared via localStorage + `storage` events), so a
// user working in one tab isn't locked in another. The lock itself is also shared and survives a reload.
// The server remains the authority on session lifetime; this protects an unattended, still-valid session.
import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_KEY = 'sac-last-activity';
const LOCK_KEY = 'sac-locked';
const WARN_SECONDS = 60;
const WRITE_THROTTLE_MS = 5_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'] as const;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: the lock still works within this tab */
  }
};

export type IdleState = 'active' | 'warning' | 'locked';

export function useIdleLock(limitMinutes: number, enabled = true) {
  const limitMs = Math.max(1, limitMinutes) * 60_000;
  const lastLocal = useRef(0);
  const lastWrite = useRef(0);
  const [state, setState] = useState<IdleState>(() => (read(LOCK_KEY) ? 'locked' : 'active'));
  const [secondsLeft, setSecondsLeft] = useState(WARN_SECONDS);

  const lastActivity = useCallback(() => Math.max(lastLocal.current, Number(read(ACTIVITY_KEY) ?? 0)), []);

  const markActive = useCallback((force = false) => {
    const now = Date.now();
    lastLocal.current = now;
    if (force || now - lastWrite.current > WRITE_THROTTLE_MS) {
      lastWrite.current = now;
      write(ACTIVITY_KEY, String(now));
    }
  }, []);

  const lock = useCallback(() => {
    write(LOCK_KEY, String(Date.now()));
    setState('locked');
  }, []);

  /** Called after the password has been confirmed. */
  const unlock = useCallback(() => {
    write(LOCK_KEY, null);
    markActive(true);
    setState('active');
  }, [markActive]);

  const stayActive = useCallback(() => {
    markActive(true);
    setState('active');
  }, [markActive]);

  // Start the clock on mount. A tab that finds no recorded activity starts fresh; one that finds stale
  // activity (e.g. reopened after the limit) locks on the first tick.
  useEffect(() => {
    if (!enabled) return;
    if (read(ACTIVITY_KEY)) lastLocal.current = Number(read(ACTIVITY_KEY));
    else markActive(true);
  }, [enabled, markActive]);

  // Activity listeners (ignored while locked so background movement can't unlock).
  useEffect(() => {
    if (!enabled) return undefined;
    const onActivity = () => {
      if (read(LOCK_KEY)) return;
      markActive();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
  }, [enabled, markActive]);

  // Cross-tab sync: another tab locked, unlocked or saw activity.
  useEffect(() => {
    if (!enabled) return undefined;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) setState(e.newValue ? 'locked' : 'active');
      if (e.key === ACTIVITY_KEY && e.newValue && !read(LOCK_KEY)) setState('active');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [enabled]);

  // The clock: warn during the last minute, then lock.
  useEffect(() => {
    if (!enabled || state === 'locked') return undefined;
    const tick = () => {
      const idle = Date.now() - lastActivity();
      if (idle >= limitMs) lock();
      else if (idle >= limitMs - WARN_SECONDS * 1000) {
        setSecondsLeft(Math.ceil((limitMs - idle) / 1000));
        setState('warning');
      } else setState((s) => (s === 'warning' ? 'active' : s));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [enabled, state, limitMs, lastActivity, lock]);

  return { state, secondsLeft, stayActive, unlock, lock };
}

/** Clears idle-lock state on sign-out so the next session starts unlocked. */
export function resetIdleLock() {
  write(LOCK_KEY, null);
  write(ACTIVITY_KEY, null);
}
