import { useState } from 'react';
import type { LiveState } from '@/lib/queryClient';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';

/**
 * Status line for a self-refreshing screen: a green dot with a slow pulse ring while live, a breathing dot while a
 * refresh is in flight, warning colour (no motion) when offline or paused. Screen readers hear only the live ↔ offline
 * transitions, not every refresh. No timer of its own: the screen re-renders on each refresh (every minute), which
 * keeps "updated … ago" current.
 */
export function LiveStatus({ state, updatedAt }: { state: LiveState; updatedAt: number }) {
  const tc = useCommonT();
  const at = new Date(updatedAt).toISOString();
  const down = state === 'offline' || state === 'paused';
  const [wasDown, setWasDown] = useState(down);
  const [announce, setAnnounce] = useState('');
  if (wasDown !== down) {
    setWasDown(down);
    setAnnounce(down ? tc('live.srOffline') : tc('live.srBack'));
  }
  return (
    <span className="live-status" data-state={state} title={updatedAt ? tc('live.lastUpdated', { time: formatDateTime(at) }) : undefined}>
      <span className="live-dot" aria-hidden="true" />
      <span>
        {state === 'paused' ? tc('live.paused') : state === 'offline' ? tc('live.offline') : tc('live.status', { ago: timeAgo(at) })}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}
