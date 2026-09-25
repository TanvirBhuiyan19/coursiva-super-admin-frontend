import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { getLocale, subscribeLocale } from './index';

/** Remounts its subtree when the locale changes so every `t()` and Intl formatter re-renders in the new locale. */
export function I18nBoundary({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return <Fragment key={locale}>{children}</Fragment>;
}
