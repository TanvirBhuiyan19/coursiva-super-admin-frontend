// Formatting and display rules shared across features. Pure functions — unit tested in format.test.ts.
import type { Tone } from './domain';

const LOCALE = 'en-US';
const nf = new Intl.NumberFormat(LOCALE);

export const num = (n: number) => nf.format(n);

/** $1,234 (whole dollars). */
export const money = (n: number) => '$' + nf.format(Math.round(n));

/** Two decimals under $100, whole dollars above: $4.20 · $1,234. */
export const moneyFine = (n: number) =>
  '$' + n.toLocaleString(LOCALE, n < 100 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });

/** $53.9K · $1.2M */
export const moneyCompact = (n: number) => '$' + new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0) + '%';

export const plural = (n: number, one: string, many = one + 's') => `${nf.format(n)} ${n === 1 ? one : many}`;

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

/** "just now" · "12m ago" · "3h ago" · "5d ago" · "Aug 12" · "Aug 12, 2025". */
export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = now - t;
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return Math.floor(diff / MIN) + 'm ago';
  if (diff < DAY) return Math.floor(diff / HOUR) + 'h ago';
  if (diff < 14 * DAY) return Math.floor(diff / DAY) + 'd ago';
  return formatDate(iso, now);
}

/** "Aug 12" in the current year, otherwise "Aug 12, 2025". */
export function formatDate(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Mar 2025" */
export const formatMonth = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

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
