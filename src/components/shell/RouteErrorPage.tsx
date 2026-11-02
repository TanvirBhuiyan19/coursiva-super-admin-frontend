import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { t } from '@/features/shell/i18n';
import { t as tc } from '@/lib/i18n/common';
import { reportError } from '@/lib/reportError';

/**
 * The router's `errorElement` for routes outside the shell (sign-in, forgot/reset password) and for the shell route
 * itself (auth guard, loaders): reports the error and shows the console's own error card instead of React Router's
 * developer "Unexpected Application Error" page. Screens inside the shell have their own RouteErrorBoundary.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  useEffect(() => {
    reportError(error, { source: 'route' });
  }, [error]);
  return (
    <div className="auth-page">
      <main className="auth-card card" role="alert" aria-labelledby="route-error-title">
        <h1 id="route-error-title" className="card-title">
          {t('routeError.title')}
        </h1>
        <p className="note" style={{ margin: '8px 0 14px' }}>
          {t('routeError.body')}
        </p>
        <div className="hstack">
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            {tc('actions.reloadPage')}
          </button>
          <Link className="btn" to="/login" reloadDocument>
            {t('routeError.toSignIn')}
          </Link>
        </div>
      </main>
    </div>
  );
}
