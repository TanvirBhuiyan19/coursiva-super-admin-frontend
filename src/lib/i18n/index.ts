// Typed, dependency-free i18n (~1 KB). Each feature owns its messages next to its code
// (`features/<f>/i18n.ts`), so strings ship in the same lazy chunk as the screen that uses them.
//
//   export const { t, useT } = defineMessages('tenants', { title: 'Tenants', count: { one: '{count} tenant', other: '{count} tenants' } });
//   t('count', { count: 3 })  // "3 tenants" — keys and {placeholders} are type-checked
//
// Messages use ICU-style `{name}` placeholders and CLDR plural categories selected by `count`
// (`zero`/`one`/`two`/`few`/`many`/`other`), the same shape i18next / Laravel translators work with.
// Translations for other languages are lazy-loaded per namespace; missing keys fall back to English.
// Changing the locale remounts the app (see I18nBoundary), so plain `t()` is always current.
import { use } from 'react';

export type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;
export interface Messages {
  [key: string]: string | Plural | Messages;
}
/** A plural message: only CLDR category keys. (A message group that merely contains an `other` key is not one.) */
type IsPlural<V> = V extends Plural ? ([Exclude<keyof V, Intl.LDMLPluralRule>] extends [never] ? true : false) : false;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : IsPlural<T[K]> extends true ? Partial<Plural> : DeepPartial<T[K]> };
export type Catalog<M extends Messages> = DeepPartial<M>;

/** Dotted paths to every message: 'title' | 'filters.plan' | … */
export type MessageKey<M, P extends string = ''> = {
  [K in keyof M & string]: M[K] extends string ? `${P}${K}` : IsPlural<M[K]> extends true ? `${P}${K}` : MessageKey<M[K], `${P}${K}.`>;
}[keyof M & string];

type Get<M, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof M
    ? Get<M[H], R>
    : never
  : K extends keyof M
    ? M[K]
    : never;
type Placeholders<S> = S extends `${string}{${infer V}}${infer R}` ? V | Placeholders<R> : never;
type VarsOf<V> = V extends string ? Placeholders<V> : V extends Plural ? Placeholders<V[keyof V]> | 'count' : never;
type Value = string | number;
/** Arguments for a key: none when it has no placeholders, otherwise an object with each one. */
export type ArgsFor<M, K extends string> = [VarsOf<Get<M, K>>] extends [never]
  ? [vars?: Record<string, Value>]
  : [vars: Record<VarsOf<Get<M, K>>, Value>];

// ---------- Locale ----------
export const LOCALES = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-XA', label: 'Pseudo-locale (QA)', qa: true },
] as const;
export type Locale = (typeof LOCALES)[number]['id'];
const STORAGE_KEY = 'sac-locale';
const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.id === v);
/** Language whose translation files are loaded; English variants share the source strings. */
const languageOf = (locale: Locale) => (locale.startsWith('en') ? 'en' : locale);

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'en-US';
}

let locale: Locale = initialLocale();
const listeners = new Set<() => void>();

export const getLocale = () => locale;
/** Locale id for Intl formatters (the pseudo-locale formats like en-US). */
export const intlLocale = () => (locale === 'en-XA' ? 'en-US' : locale);

export async function setLocale(next: Locale) {
  if (next === locale) return;
  await Promise.all([...namespaces.values()].map((ns) => ns.load(languageOf(next))));
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* preference just won't persist */
  }
  applyDocumentLocale();
  listeners.forEach((l) => l());
}
export const subscribeLocale = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function applyDocumentLocale() {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

// ---------- Formatting ----------
const pluralRules = new Map<string, Intl.PluralRules>();
function pluralOf(count: number) {
  const id = intlLocale();
  let rules = pluralRules.get(id);
  if (!rules) pluralRules.set(id, (rules = new Intl.PluralRules(id)));
  return rules.select(count);
}
const numberFormat = (n: number) => n.toLocaleString(intlLocale());

export function interpolate(template: string, vars: Record<string, Value> | undefined) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    return v === undefined ? match : typeof v === 'number' ? numberFormat(v) : v;
  });
}

const ACCENTS: Record<string, string> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  A: 'Á',
  E: 'É',
  I: 'Í',
  O: 'Ó',
  U: 'Ú',
  c: 'ç',
  n: 'ñ',
  y: 'ý',
};
/** "Save changes" → "⟦Šávé çháñgéš ·····⟧": accented, ~35% longer, bracketed — exposes hard-coded and truncated text. */
export function pseudo(text: string) {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '{') depth++;
    out += depth ? ch : (ACCENTS[ch] ?? ch);
    if (ch === '}') depth = Math.max(0, depth - 1);
  }
  const pad = Math.ceil(text.replace(/\{\w+\}/g, '').length * 0.35);
  return `⟦${out}${pad ? ' ' + '·'.repeat(pad) : ''}⟧`;
}

// ---------- Namespaces ----------
type Loader = () => Promise<{ default: Messages }>;
interface Namespace {
  load: (language: string) => Promise<void>;
}
const namespaces = new Map<string, Namespace>();

function lookup(messages: Messages | undefined, key: string): string | Plural | undefined {
  let node: string | Plural | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = (node as Messages)[part];
  }
  return node as string | Plural | undefined;
}

/**
 * Declares a namespace. `translations` maps a language to a lazy loader — pass
 * `import.meta.glob('./i18n/*.ts')` style loaders keyed by language (e.g. `{ bn: () => import('./i18n/bn') }`).
 */
export function defineMessages<const M extends Messages>(name: string, source: M, translations: Record<string, Loader> = {}) {
  const loaded = new Map<string, Messages>();
  const pending = new Map<string, Promise<void>>();

  const load = (language: string): Promise<void> => {
    const loader = translations[language];
    if (!loader || loaded.has(language)) return Promise.resolve();
    let p = pending.get(language);
    if (!p) {
      p = loader().then((m) => void loaded.set(language, m.default));
      pending.set(language, p);
    }
    return p;
  };
  if (namespaces.has(name) && import.meta.env.DEV) console.warn(`[i18n] namespace "${name}" defined twice`);
  namespaces.set(name, { load });

  function t<K extends MessageKey<M>>(key: K, ...args: ArgsFor<M, K>): string {
    const vars: Record<string, Value> | undefined = args[0];
    const language = languageOf(locale);
    let value = language === 'en' ? undefined : lookup(loaded.get(language), key);
    const fallback = lookup(source, key);
    value ??= fallback;
    if (value === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing ${name}:${String(key)}`);
      return key;
    }
    let template: string;
    if (typeof value === 'string') template = value;
    else {
      const count = Number(vars?.count ?? 0);
      const category = pluralOf(count);
      template = value[category] ?? (fallback as Plural | undefined)?.[category] ?? value.other;
      if (count === 0 && value.zero) template = value.zero;
    }
    const text = interpolate(template, vars);
    return locale === 'en-XA' ? pseudo(text) : text;
  }

  /** Hook form of `t`; suspends while this namespace's translation for the current language loads. */
  function useT() {
    const language = languageOf(locale);
    if (translations[language] && !loaded.has(language)) use(load(language));
    return t;
  }

  return { t, useT, source };
}
