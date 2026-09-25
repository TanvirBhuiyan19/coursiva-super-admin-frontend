import type { PaginationMeta } from '@/lib/api/types';
import { num } from '@/lib/format';

export function Pagination({ meta, onPage, noun = 'results' }: { meta: PaginationMeta; onPage: (page: number) => void; noun?: string }) {
  if (meta.total === 0) return null;
  return (
    <nav className="hstack wrap pagination" aria-label="Pagination">
      <span className="t-sm muted">
        {meta.from != null && meta.to != null
          ? `${num(meta.from)}–${num(meta.to)} of ${num(meta.total)} ${noun}`
          : `${num(meta.total)} ${noun}`}
      </span>
      <div className="spacer" />
      <button type="button" className="btn btn--sm" disabled={meta.currentPage <= 1} onClick={() => onPage(meta.currentPage - 1)}>
        ← Previous
      </button>
      <span className="t-sm muted" aria-current="page">
        Page {meta.currentPage} of {meta.lastPage}
      </span>
      <button
        type="button"
        className="btn btn--sm"
        disabled={meta.currentPage >= meta.lastPage}
        onClick={() => onPage(meta.currentPage + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
