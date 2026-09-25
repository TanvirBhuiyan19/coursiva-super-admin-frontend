import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

type Defaults = Record<string, string>;

/**
 * Filter/sort/page state stored in the URL query string, so views are shareable and survive reloads.
 * Values equal to their default are omitted from the URL. Changing any key other than `page` resets `page`.
 *
 *   const [f, setF] = useUrlState({ q: '', plan: 'all', page: '1' });
 *   setF({ plan: 'Scale' });
 */
export function useUrlState<D extends Defaults>(defaults: D): [D, (patch: Partial<D>) => void] {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof D & string)[]) {
      const v = params.get(k);
      if (v != null) out[k] = v as D[typeof k];
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults is a literal; key set is stable
  }, [params]);

  const update = useCallback(
    (patch: Partial<D>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === defaults[k]) next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in patch) && 'page' in defaults) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [setParams],
  );

  return [values, update];
}
