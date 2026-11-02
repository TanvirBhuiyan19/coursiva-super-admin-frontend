import { Suspense, useEffect } from 'react';
import { lazyWithPreload, whenIdle } from '@/lib/lazy';
import { useSession } from './api';
import { useIdleLock } from './useIdleLock';

// The warning and lock screens are off the critical path: fetched when the browser is idle (long before the idle
// timeout), or immediately when the tab loads already locked.
const IdleScreens = lazyWithPreload(() => import('./IdleScreens'));

/** Runs the idle timer, renders the idle warning and the lock screen; tells the shell when the app must be inert. */
export function IdleLock({ onLockedChange }: { onLockedChange: (locked: boolean) => void }) {
  const { data: user } = useSession();
  const { state, secondsLeft, stayActive, unlock } = useIdleLock(user?.idleLockMinutes ?? 15, !!user);

  useEffect(() => onLockedChange(state === 'locked'), [state, onLockedChange]);
  useEffect(() => whenIdle(() => void IdleScreens.preload()), []);

  if (!user || (state !== 'warning' && state !== 'locked')) return null;
  return (
    <Suspense fallback={null}>
      <IdleScreens state={state} secondsLeft={secondsLeft} name={user.name} email={user.email} stayActive={stayActive} unlock={unlock} />
    </Suspense>
  );
}
