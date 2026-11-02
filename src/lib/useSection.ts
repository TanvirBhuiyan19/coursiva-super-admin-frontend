import { useSearchParams } from 'react-router-dom';

/**
 * The active section of a `SectionedPage`, kept in `?section=` so every section can be linked to and back/forward
 * moves between sections (each switch is a history entry). Unknown or missing ids fall back to `fallback`, which is
 * left out of the URL. Other query params (filters, `?doc=` …) are kept.
 *
 *   const [section, setSection, sectionHref] = useSection(['keys', 'webhooks'], 'keys');
 *   <SectionedPage active={section} onChange={setSection} href={sectionHref} …>
 */
export function useSection<K extends string>(ids: readonly K[], fallback: K) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  const active = ids.find((id) => id === raw) ?? fallback;

  const withSection = (id: K) => {
    const next = new URLSearchParams(params);
    if (id === fallback) next.delete('section');
    else next.set('section', id);
    return next;
  };
  const setActive = (id: K) => setParams(withSection(id));
  const href = (id: K) => {
    const qs = withSection(id).toString();
    return qs ? `?${qs}` : '?';
  };
  return [active, setActive, href] as const;
}
