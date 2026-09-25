import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api/errors';
import { ApiError } from '@/lib/api/errors';
import { useT as useCommonT } from '@/lib/i18n/common';
import { Card } from './Layout';
import { SkeletonRows } from './Misc';

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const tc = useCommonT();
  const forbidden = error instanceof ApiError && error.isForbidden;
  const body = (
    <div className="empty" role="alert">
      <div style={{ fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>
        {forbidden ? tc('errors.forbidden') : tc('errors.loadFailed')}
      </div>
      <div>{forbidden ? tc('errors.forbiddenHint') : errorMessage(error)}</div>
      {onRetry && !forbidden && (
        <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} onClick={onRetry}>
          {tc('actions.retry')}
        </button>
      )}
    </div>
  );
  return compact ? body : <Card>{body}</Card>;
}

/**
 * Renders loading / error / success for a query.
 * `<QueryState query={q} skeleton={<SkeletonRows />}>{(data) => …}</QueryState>`
 */
export function QueryState<T>({
  query,
  children,
  skeleton,
  compact,
}: {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isPending' | 'refetch'>;
  children: (data: T) => ReactNode;
  skeleton?: ReactNode;
  compact?: boolean;
}) {
  if (query.isPending) return <>{skeleton ?? <SkeletonRows />}</>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={compact} />;
  return <>{children(query.data as T)}</>;
}
