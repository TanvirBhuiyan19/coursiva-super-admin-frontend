import { afterEach, describe, expect, it } from 'vitest';
import { money, timeAgo } from '@/lib/format';
import { defineMessages, getLocale, interpolate, pseudo, setLocale } from './index';

const { t } = defineMessages(
  'test',
  {
    title: 'Tenants',
    greeting: 'Hello {name}',
    nested: { deep: 'Deep value', other: 'Other group item' },
    count: { zero: 'No tenants', one: '{count} tenant', other: '{count} tenants' },
  },
  { fr: () => Promise.resolve({ default: { title: 'Locataires' } }) },
);

afterEach(async () => {
  await setLocale('en-US');
});

describe('i18n', () => {
  it('looks up nested keys and interpolates placeholders', () => {
    expect(t('title')).toBe('Tenants');
    expect(t('nested.deep')).toBe('Deep value');
    // A group with an `other` key is still a group, not a plural message.
    expect(t('nested.other')).toBe('Other group item');
    expect(t('greeting', { name: 'Sam' })).toBe('Hello Sam');
  });

  it('selects CLDR plural categories and formats numbers in the locale', () => {
    expect(t('count', { count: 0 })).toBe('No tenants');
    expect(t('count', { count: 1 })).toBe('1 tenant');
    expect(t('count', { count: 1200 })).toBe('1,200 tenants');
  });

  it('leaves unknown placeholders intact', () => {
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });

  it('pseudo-localises text but keeps placeholders', () => {
    expect(pseudo('Save {name}')).toBe('⟦Sávé {name} ··⟧');
    expect(pseudo('Hi {count}')).toContain('{count}');
  });

  it('switches locale: pseudo text, locale-aware formatting, persisted choice', async () => {
    await setLocale('en-XA');
    expect(getLocale()).toBe('en-XA');
    expect(t('title').startsWith('⟦')).toBe(true);
    expect(document.documentElement.lang).toBe('en-XA');

    await setLocale('en-GB');
    expect(t('title')).toBe('Tenants');
    expect(money(1234)).toBe('US$1,234');
    expect(timeAgo(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe('3 days ago');
    expect(localStorage.getItem('sac-locale')).toBe('en-GB');
  });
});
