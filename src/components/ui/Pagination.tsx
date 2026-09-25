import type { PaginationMeta } from '@/lib/api/types';
import { useT as useCommonT } from '@/lib/i18n/common';

export function Pagination({ meta, onPage, noun }: { meta: PaginationMeta; onPage: (page: number) => void; noun?: string }) {
  const tc = useCommonT();
  if (meta.total === 0) return null;
  const n = noun ?? tc('pagination.results');
  return (
    <nav className="hstack wrap pagination" aria-label={tc('pagination.label')}>
      <span className="t-sm muted">
        {meta.from != null && meta.to != null
          ? tc('pagination.range', { from: meta.from, to: meta.to, total: meta.total, noun: n })
          : tc('pagination.total', { total: meta.total, noun: n })}
      </span>
      <div className="spacer" />
      <button type="button" className="btn btn--sm" disabled={meta.currentPage <= 1} onClick={() => onPage(meta.currentPage - 1)}>
        {tc('pagination.previous')}
      </button>
      <span className="t-sm muted" aria-current="page">
        {tc('pagination.page', { page: meta.currentPage, pages: meta.lastPage })}
      </span>
      <button
        type="button"
        className="btn btn--sm"
        disabled={meta.currentPage >= meta.lastPage}
        onClick={() => onPage(meta.currentPage + 1)}
      >
        {tc('pagination.next')}
      </button>
    </nav>
  );
}
