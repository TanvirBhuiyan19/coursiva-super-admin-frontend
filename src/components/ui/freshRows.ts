// "Something just changed" signals for self-refreshing screens (CSS in motion.css: .fx-fresh, .fx-flash-a/b).
import { useState, type CSSProperties } from 'react';

/**
 * Rows that arrived with a refresh of the same list (polling, refetch on focus, a mutation's invalidation) get a short
 * "fresh" entrance; rows that were already there never move. The first settled data is the baseline and never
 * animates. Pass `settled = false` while there is no data yet or placeholder data is showing.
 */
export function useFreshRows(keys: readonly string[], settled = true) {
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(() => (settled ? new Set(keys) : null));
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  if (settled) {
    const unseen = seen ? keys.filter((k) => !seen.has(k)) : [];
    if (!seen) setSeen(new Set(keys));
    else if (unseen.length) {
      setSeen(new Set([...seen, ...unseen]));
      setFresh(new Set(unseen));
    }
  }
  const order = keys.filter((k) => fresh.has(k));
  return {
    /** `fx-fresh` for a row that just arrived, otherwise undefined. */
    cls: (k: string) => (fresh.has(k) ? 'fx-fresh' : undefined),
    /** The stagger index among the rows that arrived together. */
    style: (k: string) => (fresh.has(k) ? ({ '--i': Math.min(order.indexOf(k), 8) } as CSSProperties) : undefined),
  };
}

/**
 * A soft tint on an element whose value changed in place (a KPI after a background refresh, a service whose status
 * moved). `scope` is what the value answers (e.g. the selected range): a new scope sets a new baseline instead of
 * flashing; `null` (placeholder data showing) neither flashes nor moves the baseline. Returns a class name or undefined.
 */
export function useChangeFlash(value: string | number | null | undefined, scope: string | null = '') {
  const [state, setState] = useState<{ scope: string | null; value: typeof value; n: number }>(() => ({ scope, value, n: 0 }));
  if (scope !== null && value != null) {
    if (state.scope !== scope || state.value == null) setState({ scope, value, n: state.n });
    else if (state.value !== value) setState({ scope, value, n: state.n + 1 });
  }
  // A new baseline keeps the class as it is (nothing restarts); every in-scope change bumps n and flips a ↔ b.
  return state.n === 0 ? undefined : state.n % 2 ? 'fx-flash-a' : 'fx-flash-b';
}
