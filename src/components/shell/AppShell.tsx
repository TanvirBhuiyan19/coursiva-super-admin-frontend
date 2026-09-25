import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { screenForPath } from '@/app/screens';
import { IdleLock } from '@/features/auth/IdleLock';
import { useT } from '@/features/shell/i18n';
import { ImpersonationView, ProvisionTenantModal } from '@/features/tenants';
import { lazyWithPreload, whenIdle } from '@/lib/lazy';
import { useUi } from '@/store/ui';
import { SkeletonRows } from '../ui';
import Header from './Header';
import Sidebar from './Sidebar';
import Toasts from './Toasts';
import { RouteErrorBoundary } from './RouteErrorBoundary';

// Overlays are lazy (off the critical path) and preloaded when the browser is idle, so they still open instantly.
const CommandPalette = lazyWithPreload(() => import('./CommandPalette'));

export default function AppShell() {
  const t = useT();
  const { pathname } = useLocation();
  const screen = screenForPath(pathname);
  const cmdOpen = useUi((s) => s.cmdOpen);
  const provisionOpen = useUi((s) => s.provisionOpen);
  const mobileNav = useUi((s) => s.mobileNav);
  const impersonating = useUi((s) => s.impersonating);
  const setUi = useUi((s) => s.set);
  const content = useRef<HTMLElement>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    whenIdle(() => {
      void CommandPalette.preload();
      void ProvisionTenantModal.preload();
    });
  }, []);

  // ⌘K / Ctrl+K toggles the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.setState((s) => ({ cmdOpen: !s.cmdOpen }));
      } else if (e.key === 'Escape') {
        useUi.setState({ mobileNav: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Document title follows the screen; a new screen starts at the top.
  useEffect(() => {
    document.title = screen ? t('documentTitle', { screen: screen.title }) : t('documentTitleFallback');
    content.current?.scrollTo(0, 0);
  }, [screen, t]);

  return (
    // While idle-locked the whole app is inert (no focus, clicks or screen-reader access) behind the lock screen.
    <div className={'shell' + (mobileNav ? ' nav-open' : '')} inert={locked}>
      <a href="#main" className="skip-link">
        {t('skipToContent')}
      </a>
      <Sidebar screen={screen} />
      <div className="sb-backdrop" onClick={() => setUi({ mobileNav: false })} aria-hidden="true" />
      <div className="main">
        <Header screen={screen} />
        <main className="content" id="main" ref={content} tabIndex={-1}>
          <RouteErrorBoundary resetKey={pathname}>
            <Suspense
              fallback={
                <div className="screen" style={{ maxWidth: 1200 }}>
                  <SkeletonRows rows={8} h={22} />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </RouteErrorBoundary>
        </main>
      </div>
      <Suspense fallback={null}>
        {cmdOpen && <CommandPalette />}
        {provisionOpen && <ProvisionTenantModal />}
        {impersonating && <ImpersonationView />}
      </Suspense>
      <Toasts />
      <IdleLock onLockedChange={setLocked} />
    </div>
  );
}
