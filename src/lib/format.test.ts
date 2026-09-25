import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatDate,
  initials,
  money,
  moneyCompact,
  moneyFine,
  plural,
  scoreTone,
  shortDuration,
  timeAgo,
  utilTone,
} from './format';

const NOW = new Date('2026-09-25T12:00:00Z').getTime();
const minus = (ms: number) => new Date(NOW - ms).toISOString();

describe('money', () => {
  it('formats whole dollars with separators', () => {
    expect(money(4491.4)).toBe('$4,491');
    expect(moneyFine(4.2)).toBe('$4.20');
    expect(moneyFine(1234.56)).toBe('$1,235');
    expect(moneyCompact(53_892)).toBe('$53.9K');
  });
});

describe('timeAgo', () => {
  it('uses the coarsest sensible unit', () => {
    expect(timeAgo(minus(30_000), NOW)).toBe('just now');
    expect(timeAgo(minus(12 * 60_000), NOW)).toBe('12m ago');
    expect(timeAgo(minus(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(timeAgo(minus(5 * 86_400_000), NOW)).toBe('5d ago');
  });
  it('falls back to a date after two weeks and handles missing values', () => {
    expect(timeAgo(minus(40 * 86_400_000), NOW)).toBe(formatDate(minus(40 * 86_400_000), NOW));
    expect(timeAgo(null)).toBe('—');
  });
});

describe('helpers', () => {
  it('builds initials', () => {
    expect(initials('Nordic Yoga School')).toBe('NY');
    expect(initials('  sam  ortega ')).toBe('SO');
  });
  it('pluralises', () => {
    expect(plural(1, 'tenant')).toBe('1 tenant');
    expect(plural(1200, 'tenant')).toBe('1,200 tenants');
  });
  it('computes days until', () => {
    expect(daysUntil(new Date(NOW + 2.5 * 86_400_000).toISOString(), NOW)).toBe(3);
    expect(daysUntil(minus(86_400_000), NOW)).toBe(-1);
  });
  it('formats short durations', () => {
    expect(shortDuration(45)).toBe('45m');
    expect(shortDuration(-130)).toBe('2h');
    expect(shortDuration(3000)).toBe('2d');
  });
  it('maps thresholds to tones', () => {
    expect(scoreTone(70)).toBe('good');
    expect(scoreTone(45)).toBe('warn');
    expect(scoreTone(44)).toBe('bad');
    expect(utilTone(90)).toBe('bad');
    expect(utilTone(70)).toBe('warn');
    expect(utilTone(10)).toBe('accent');
  });
});
