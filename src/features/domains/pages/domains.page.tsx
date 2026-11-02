import { lazy, Suspense } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Screen, SkeletonRows } from '@/components/ui';
import { cx } from '@/lib/cx';
import { useT } from '../i18n';

// Each area loads on first visit, so the screen's chunk stays small.
const RegistrationsView = lazy(() => import('../views/RegistrationsView'));
const TasksView = lazy(() => import('../views/TasksView'));
const OrdersView = lazy(() => import('../views/OrdersView'));
const SettingsView = lazy(() => import('../views/SettingsView'));

const AREAS = ['registrations', 'tasks', 'orders', 'settings'] as const;
type Area = (typeof AREAS)[number];
const pathOfArea = (a: Area) => (a === 'registrations' ? '/domains' : `/domains/${a}`);

/**
 * Domains: registrations (`/domains`, `/domains/{id}` opens one), registrar tasks, orders and settings — one screen,
 * one nav entry (with the open-task badge), its areas as nested routes.
 */
export default function DomainsPage() {
  const t = useT();
  const { pathname } = useLocation();
  const segment = pathname.split('/')[2] ?? '';
  const active: Area = AREAS.find((a) => a !== 'registrations' && a === segment) ?? 'registrations';
  return (
    <Screen max={1250} label={t('areas.label')}>
      <nav aria-label={t('areas.label')}>
        <ul className="plain-list hstack wrap" style={{ gap: 6 }}>
          {AREAS.map((a) => (
            <li key={a}>
              <Link
                to={pathOfArea(a)}
                className={cx('chip chip--sm', active === a && 'is-on')}
                aria-current={active === a ? 'page' : undefined}
              >
                {t(`areas.${a}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Suspense fallback={<SkeletonRows rows={8} h={22} />}>
        <Routes>
          <Route path="tasks" element={<TasksView />} />
          <Route path="orders" element={<OrdersView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="*" element={<RegistrationsView />} />
        </Routes>
      </Suspense>
    </Screen>
  );
}
