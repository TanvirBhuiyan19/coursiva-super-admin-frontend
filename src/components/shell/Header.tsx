import { Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { pathOf, screenTitle, type ScreenDef } from '@/app/screens';
import { useLogout, useSession } from '@/features/auth/api';
import { Can } from '@/features/auth/Can';
import { useMarkNotificationsRead, useNotifications, usePlatformStatus, type Notification } from '@/features/shell/api';
import { useT } from '@/features/shell/i18n';
import { useT as useCommonT } from '@/lib/i18n/common';
import { lazyWithPreload } from '@/lib/lazy';
import { useUi } from '@/store/ui';
import { Dot } from '../ui/Badge';
import { Icon } from '../ui/Icon';
import { useFreshRows } from '../ui/freshRows';
import { canAnimate, popoverExitRef } from '../ui/motion';
import { NotificationRow } from './NotificationRow';

/** "Load older" pages of the notifications panel — off the critical path (the bell reads the first page only). */
const NotificationsOlder = lazyWithPreload(() => import('./NotificationsOlder'));

const SUN =
  'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z';
const MOON = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';
const SHORTCUT = '⌘K';

/** One gentle swing of the bell when a new unread notification arrives (played once, never looping). */
const RING: Keyframe[] = [
  { transform: 'rotate(0)' },
  { transform: 'rotate(13deg)', offset: 0.15 },
  { transform: 'rotate(-10deg)', offset: 0.35 },
  { transform: 'rotate(6deg)', offset: 0.55 },
  { transform: 'rotate(-3deg)', offset: 0.75 },
  { transform: 'rotate(0)' },
];

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** The open panel's rows. Notifications that arrive while it is open slide in; the ones already there stay put. */
function NotificationRows({ data, onPick }: { data: Notification[]; onPick: () => void }) {
  const fresh = useFreshRows(data.map((n) => n.id));
  return (
    <>
      {data.map((n) => (
        <NotificationRow key={n.id} n={n} onPick={onPick} className={fresh.cls(n.id) ? 'fx-fresh' : undefined} style={fresh.style(n.id)} />
      ))}
    </>
  );
}

function Notifications() {
  const t = useT();
  const open = useUi((s) => s.notifOpen);
  const setUi = useUi((s) => s.set);
  const notifications = useNotifications();
  const data = notifications.data?.data ?? [];
  const olderCursor = notifications.data?.meta.nextCursor ?? null;
  const markRead = useMarkNotificationsRead();
  const unread = data.filter((n) => !n.read).length;
  const close = () => setUi({ notifOpen: false });
  const ref = useDismiss(open, close);

  // Ring once when an unread notification we haven't seen arrives — never on the first load.
  const bell = useRef<HTMLButtonElement>(null);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const list = notifications.data?.data;
    if (!list) return;
    const ids = list.filter((n) => !n.read).map((n) => n.id);
    if (seen.current && ids.some((id) => !seen.current!.has(id)) && canAnimate()) {
      bell.current?.querySelector('svg')?.animate(RING, { duration: 700, easing: 'ease-in-out' });
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [notifications.data]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={bell}
        type="button"
        className="icon-btn notif-bell"
        aria-label={unread ? t('notifications.unreadLabel', { count: unread }) : t('notifications.title')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setUi({ notifOpen: !open })}
        onPointerEnter={() => {
          if (olderCursor) void NotificationsOlder.preload();
        }}
      >
        <Icon d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        {/* Keyed by the count, so the dot pops in again whenever the unread count changes. */}
        {unread > 0 && (
          <span key={unread} className="notif-badge">
            <Dot tone="bad" />
          </span>
        )}
      </button>
      {open && (
        <div ref={popoverExitRef} className="popover" role="dialog" aria-label={t('notifications.title')}>
          <div className="hstack" style={{ padding: '12px 15px', borderBottom: '1px solid var(--bd2)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t('notifications.title')}</span>
            <button
              type="button"
              className="link"
              style={{ fontSize: 12, fontWeight: 600 }}
              disabled={!unread || markRead.isPending}
              onClick={() => markRead.mutate()}
            >
              {t('notifications.markAllRead')}
            </button>
          </div>
          {data.length === 0 && <div className="empty">{t('notifications.empty')}</div>}
          {/* Scrolls once older pages are appended; the header row stays put. */}
          <div style={{ maxHeight: 'min(70vh, 560px)', overflowY: 'auto' }}>
            <NotificationRows data={data} onPick={close} />
            {olderCursor && (
              <Suspense fallback={null}>
                <NotificationsOlder cursor={olderCursor} onPick={close} />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const t = useT();
  const tc = useCommonT();
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!user) return null;
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('header.accountMenu')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
      </button>
      {open && (
        <div ref={popoverExitRef} className="popover" role="menu" style={{ width: 240 }}>
          <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--bd2)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</div>
            <div className="t-xs muted ellipsis">{user.email}</div>
            <div className="t-xs faint" style={{ marginTop: 2 }}>
              {user.role}
            </div>
          </div>
          <Link role="menuitem" className="menu-item" to={pathOf('account')} onClick={() => setOpen(false)}>
            {screenTitle('account')}
          </Link>
          <Link role="menuitem" className="menu-item" to={pathOf('settings')} onClick={() => setOpen(false)}>
            {screenTitle('settings')}
          </Link>
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })}
          >
            {tc('actions.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ screen }: { screen: ScreenDef | undefined }) {
  const t = useT();
  const navigate = useNavigate();
  const uiMode = useUi((s) => s.uiMode);
  const toggleUiMode = useUi((s) => s.toggleUiMode);
  const setUi = useUi((s) => s.set);
  const { data: status } = usePlatformStatus();
  const degraded = status ? !status.operational : false;
  const sysLabel = degraded ? t('header.degraded') : t('header.operational');

  return (
    <header className="header">
      <button
        type="button"
        className="icon-btn menu-btn"
        aria-label={t('header.openNavigation')}
        onClick={() => setUi({ mobileNav: true })}
      >
        <Icon d="M3 6h18M3 12h18M3 18h18" />
      </button>
      <h1 className="header-title">{screen?.title ?? t('brand')}</h1>
      <div className="spacer" />
      <button
        type="button"
        className="search-pill"
        aria-label={t('header.searchLabel')}
        title={t('header.searchTitle')}
        onClick={() => setUi({ cmdOpen: true })}
      >
        <Icon size={15} stroke={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </Icon>
        <span className="search-text ellipsis" style={{ flex: 1, textAlign: 'left' }}>
          {t('header.searchPlaceholder')}
        </span>
        <kbd className="kbd">{SHORTCUT}</kbd>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={uiMode === 'Dark' ? t('header.lightMode') : t('header.darkMode')}
        onClick={() => {
          // Cross-fade the whole page between themes where the browser supports View Transitions (flushSync: the new
          // theme's tokens must be applied before the browser captures the "after" picture).
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduce && 'startViewTransition' in document) document.startViewTransition(() => flushSync(toggleUiMode));
          else toggleUiMode();
        }}
      >
        <Icon d={uiMode === 'Dark' ? SUN : MOON} />
      </button>
      <Notifications />
      {status && (
        <button
          type="button"
          className="sys-status"
          title={status.incident?.title ?? sysLabel}
          onClick={() => navigate(`${pathOf('flags')}?section=status`)}
          style={{ color: degraded ? 'var(--aFg)' : 'var(--gFg)' }}
        >
          <Dot tone={degraded ? 'warn' : 'good'} size={8} />
          <span className="sys-text ellipsis">{sysLabel}</span>
        </button>
      )}
      <UserMenu />
      <Can permission="tenants.manage">
        <button
          type="button"
          className="btn btn--primary"
          style={{ height: 36, fontSize: 13, fontWeight: 600 }}
          onClick={() => setUi({ provisionOpen: true })}
        >
          +<span className="header-new-label"> {t('header.newTenant')}</span>
        </button>
      </Can>
    </header>
  );
}
