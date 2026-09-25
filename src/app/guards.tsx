import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useSession } from '@/features/auth/api';
import type { Permission } from '@/features/auth/permissions';
import { useCan } from '@/features/auth/useCan';
import { ErrorState, SkeletonRows } from '@/components/ui';
import { useT } from './i18n';

function FullPageLoading() {
  return (
    <div className="auth-page" aria-busy="true">
      <div style={{ width: 280 }}>
        <SkeletonRows rows={3} />
      </div>
    </div>
  );
}

/** Signed-out users go to /login (remembering where they were headed). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, error, refetch } = useSession();
  const location = useLocation();
  if (isPending) return <FullPageLoading />;
  if (error)
    return (
      <div className="auth-page">
        <div style={{ width: 420 }}>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Signed-in users visiting /login go to the page they were headed to (or the dashboard). */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <FullPageLoading />;
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;
  return <>{children}</>;
}

/** Screen-level permission gate. The API enforces the same rule. */
export function RequirePermission({ permission, children }: { permission: Permission | undefined; children: ReactNode }) {
  const t = useT();
  const can = useCan();
  if (can(permission)) return <>{children}</>;
  return (
    <div className="screen" style={{ maxWidth: 640 }}>
      <div className="card" role="alert">
        <h2 className="card-title">{t('guards.forbiddenTitle')}</h2>
        <p className="note" style={{ margin: '8px 0 14px' }}>
          {t('guards.forbiddenBody')}
        </p>
        <Link className="btn" to="/">
          {t('guards.backToDashboard')}
        </Link>
      </div>
    </div>
  );
}

export function NotFound() {
  const t = useT();
  return (
    <div className="screen" style={{ maxWidth: 640 }}>
      <div className="card">
        <h2 className="card-title">{t('guards.notFoundTitle')}</h2>
        <p className="note" style={{ margin: '8px 0 14px' }}>
          {t('guards.notFoundBody')}
        </p>
        <Link className="btn btn--primary" to="/">
          {t('guards.goToDashboard')}
        </Link>
      </div>
    </div>
  );
}
