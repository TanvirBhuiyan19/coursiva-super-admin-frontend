// Display helpers shared by the governance screens.
import type { Tone } from '@/lib/domain';
import { monthName } from '@/lib/format';
import { t } from '../i18n';

/** "in 4d" · "Due today" · "2d overdue" (long: "4 days"). */
export function dueLabel(days: number, long = false) {
  if (days < 0) return t('due.overdue', { days: Math.abs(days) });
  if (days === 0) return t('due.today');
  return long ? t('due.days', { count: days }) : t('due.inDays', { days });
}

/** Strike count → tone: at the limit bad, one away warn. */
export const strikeTone = (n: number, limit: number): Tone => (n >= limit ? 'bad' : n === limit - 1 ? 'warn' : 'flat');

/** "Jun, Sep" for a list of ISO timestamps. */
export const monthList = (isos: string[]) => isos.map((iso) => monthName(iso, 'short')).join(', ');

/** Region → dot tone (the design's region palette mapped to tokens). */
export const REGION_TONE = { EU: 'info', US: 'good', APAC: 'warn' } as const satisfies Record<string, Tone>;

/** Whether `iso` is less than 24 hours ago. */
export const withinDay = (iso: string, now = Date.now()) => now - new Date(iso).getTime() < 86_400_000;
