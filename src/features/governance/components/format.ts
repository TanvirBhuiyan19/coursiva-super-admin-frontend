// Display helpers shared by the governance screens.
import type { Tone } from '@/lib/domain';

/** "in 4d" · "due today" · "2d overdue" (long: "4 days"). */
export function dueLabel(days: number, long = false) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  return long ? `${days} day${days === 1 ? '' : 's'}` : `in ${days}d`;
}

/** Strike count → tone: at the limit bad, one away warn. */
export const strikeTone = (n: number, limit: number): Tone => (n >= limit ? 'bad' : n === limit - 1 ? 'warn' : 'flat');

/** "Jun, Sep" for a list of ISO timestamps. */
export const monthList = (isos: string[]) => isos.map((iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short' })).join(', ');

/** Region → dot tone (the design's region palette mapped to tokens). */
export const REGION_TONE = { EU: 'info', US: 'good', APAC: 'warn' } as const satisfies Record<string, Tone>;

/** Whether `iso` is less than 24 hours ago. */
export const withinDay = (iso: string, now = Date.now()) => now - new Date(iso).getTime() < 86_400_000;
