import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api/errors';
import { ApiError } from '@/lib/api/errors';
import { Card } from './Layout';
import { SkeletonRows } from './Misc';

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const forbidden = error instanceof ApiError && error.isForbidden;
  const body = (
    <div className="empty" role="alert">
      <div style={{ fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>
        {forbidden ? 'You don’t have access to this' : 'Couldn’t load this'}
      </div>
      <div>{forbidden ? 'Ask a platform owner to grant you the permission.' : errorMessage(error)}</div>
      {onRetry && !forbidden && (
        <button type="button" className="btn btn--sm" style={{ marginTop: 12 }} onClick={onRetry}>
          Try again
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
