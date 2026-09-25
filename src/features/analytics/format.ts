// Display helpers for the analytics screens (units the shared lib/format.ts doesn't cover).
import type { Tone } from '@/lib/domain';
import { intlLocale } from '@/lib/i18n';

// Follows the active locale; instances cached per locale.
const cache = new Map<string, Intl.NumberFormat>();
function nf(digits: number) {
  const key = `${intlLocale()}|${digits}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: digits })));
  return f;
}

/** 62,400 GB → "62.4 TB"; 820 GB → "820 GB". */
export const formatGb = (gb: number) => (gb >= 1000 ? `${nf(1).format(gb / 1000)} TB` : `${nf(1).format(gb)} GB`);

/** 1,920,000 → "1.92M"; 640,000 → "640k"; 84,000,000 → "84M". */
export function compactCount(n: number) {
  if (n >= 1_000_000) return `${nf(2).format(n / 1_000_000)}M`;
  if (n >= 1000) return `${nf(1).format(n / 1000)}k`;
  return nf(1).format(n);
}

/** "+4 pts" · "−0.4 pts" (true minus sign). */
export const signed = (n: number, unit = '') => `${n >= 0 ? '+' : '−'}${nf(1).format(Math.abs(n))}${unit}`;

/** Colour for a period-over-period delta. */
export const deltaTone = (n: number, higherIsBetter = true): Tone => (n === 0 ? 'flat' : n > 0 === higherIsBetter ? 'good' : 'bad');
