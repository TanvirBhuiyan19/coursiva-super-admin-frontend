// Formatting and display rules shared across features. Pure functions — unit tested in format.test.ts.
import type { Tone } from './domain';
import { intlLocale } from './i18n';
import { t } from './i18n/common';

// Every formatter follows the active locale (`lib/i18n`); instances are cached per locale + options.
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();
function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  kind: string,
  options: object,
  make: (locale: string) => T,
): T {
  const locale = intlLocale();
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key) as T | undefined;
  if (!f) cache.set(key, (f = make(locale)));
  return f;
}
const numberFormat = (o: Intl.NumberFormatOptions = {}) => cached('n', o, (l) => new Intl.NumberFormat(l, o));
const dateFormat = (o: Intl.DateTimeFormatOptions) => cached('d', o, (l) => new Intl.DateTimeFormat(l, o));
const relativeFormat = () => cached('r', {}, (l) => new Intl.RelativeTimeFormat(l, { style: 'narrow', numeric: 'auto' }));

/** Platform amounts are always US dollars; only the presentation follows the locale. */
const CURRENCY = 'USD';

export const num = (n: number) => numberFormat().format(n);

/** $1,234 (whole dollars). */
export const money = (n: number) => numberFormat({ style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(Math.round(n));

/** Two decimals under $100, whole dollars above: $4.20 · $1,234. */
export const moneyFine = (n: number) =>
  numberFormat(
    n < 100
      ? { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 },
  ).format(n);

/** $53.9K · $1.2M */
export const moneyCompact = (n: number) =>
  numberFormat({ style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0) + '%';

export const initials = (name: string, max = 2) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, max)
    .join('');

// Dark enough that white initials meet WCAG AA contrast (4.5:1).
const AVATAR_COLORS = [
  'oklch(0.5 0.11 250)',
  'oklch(0.47 0.11 150)',
  'oklch(0.5 0.15 25)',
  'oklch(0.48 0.13 300)',
  'oklch(0.5 0.11 60)',
  'oklch(0.48 0.09 200)',
];
/** Stable avatar colour for an id (same id → same colour everywhere). */
export function avatarColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

// ---------- Dates (API sends ISO-8601 UTC strings) ----------
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now" · "12m ago" · "3h ago" · "5d ago" · "Aug 12" · "Aug 12, 2025" (en-US; other locales use their CLDR forms). */
export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const t0 = new Date(iso).getTime();
  const diff = now - t0;
  if (diff < MIN) return t('time.justNow');
  if (diff < HOUR) return relativeFormat().format(-Math.floor(diff / MIN), 'minute');
  if (diff < DAY) return relativeFormat().format(-Math.floor(diff / HOUR), 'hour');
  if (diff < 14 * DAY) return relativeFormat().format(-Math.floor(diff / DAY), 'day');
  return formatDate(iso, now);
}

/** "Aug 12" in the current year, otherwise "Aug 12, 2025". */
export function formatDate(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return dateFormat({ month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}

/** "Mar 2025" */
export const formatMonth = (iso: string) => dateFormat({ month: 'short', year: 'numeric' }).format(new Date(iso));

/** Month name of a calendar date (`2025-03-01` or a timestamp), read in UTC: "Mar" / "March". */
export const monthName = (iso: string, width: 'short' | 'long' = 'short') =>
  dateFormat({ month: width, timeZone: 'UTC' }).format(new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso));

/** "Aug 12" (no year). */
export const formatDay = (iso: string) => dateFormat({ month: 'short', day: 'numeric' }).format(new Date(iso));

export const formatDateTime = (iso: string) =>
  dateFormat({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/** Whole days from now until `iso` (negative when in the past). */
export const daysUntil = (iso: string, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / DAY);

/** "4m" · "3h" · "2d" for a duration in minutes. */
export function shortDuration(minutes: number) {
  const m = Math.abs(Math.round(minutes));
  return m >= 1440 ? Math.round(m / 1440) + 'd' : m >= 60 ? Math.round(m / 60) + 'h' : m + 'm';
}

// ---------- Tones (colour bands from the design) ----------
export const planTone = (p: string): Tone => (p === 'Scale' ? 'info' : p === 'Growth' ? 'good' : 'warn');
export const statusTone = (s: string): Tone => (s === 'Active' ? 'good' : s === 'Trial' ? 'warn' : s === 'Suspended' ? 'flat' : 'bad');
export const healthTone = (h: string): Tone => (h === 'Healthy' ? 'good' : h === 'Watch' ? 'warn' : 'bad');
export const sevTone = (s: string): Tone => (s === 'High' ? 'bad' : s === 'Medium' ? 'warn' : 'flat');
export const scoreTone = (score: number, good = 70, warn = 45): Tone => (score >= good ? 'good' : score >= warn ? 'warn' : 'bad');
/** Utilisation bar colour: ≥90% bad, ≥70% warn. */
export const utilTone = (pct: number): Tone => (pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'accent');

const FG: Record<Tone, string> = {
  good: 'var(--gFg)',
  warn: 'var(--aFg)',
  bad: 'var(--rFg)',
  info: 'var(--bFg)',
  flat: 'var(--tx2)',
  accent: 'var(--ac)',
};
const DOT: Record<Tone, string> = {
  good: 'var(--gDot)',
  warn: 'var(--aDot)',
  bad: 'var(--rDot)',
  info: 'var(--bFg)',
  flat: 'var(--togOff)',
  accent: 'var(--ac)',
};
export const toneFg = (tone: Tone) => FG[tone];
export const toneDot = (tone: Tone) => DOT[tone];
