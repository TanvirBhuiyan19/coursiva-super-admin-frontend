// Display helpers local to billing screens.
import { money, num } from '@/lib/format';

/** "August" (or "Aug" when short) for an ISO date (first-of-month, UTC). */
export const monthName = (isoDate: string, short = false) =>
  new Date(isoDate.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: short ? 'short' : 'long', timeZone: 'UTC' });

/** +$1,234 · −$56 */
export const signedMoney = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n));

/** "500 students" · "Unlimited students" (0 = unlimited). */
export const limitText = (n: number, unit: string) => (n === 0 ? `Unlimited ${unit}` : `${num(n)} ${unit}`);

/** "50 GB storage" · "2 TB storage" · "Unlimited storage". */
export const storageText = (gb: number) =>
  gb === 0 ? 'Unlimited storage' : gb >= 1000 ? `${num(gb / 1000)} TB storage` : `${num(gb)} GB storage`;
