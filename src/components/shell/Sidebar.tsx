import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { preloadScreen } from '@/app/pages';
import { NAV, pathOf, screenById, type ScreenDef, type ScreenId } from '@/app/screens';
import { useSession } from '@/features/auth/api';
import { useCan } from '@/features/auth/useCan';
import { useNavBadges } from '@/features/shell/api';
import { avatarColor, initials } from '@/lib/format';
import { cx } from '@/lib/cx';
import { useUi } from '@/store/ui';
import { Avatar, Icon } from '../ui';

export default function Sidebar({ screen }: { screen: ScreenDef | undefined }) {
  const can = useCan();
  const { data: user } = useSession();
  const { data: badges } = useNavBadges();
  const navOpen = useUi((s) => s.navOpen);
  const toggleNavGroup = useUi((s) => s.toggleNavGroup);
  const closeMobile = () => useUi.getState().set({ mobileNav: false });

  // Deep links (e.g. /platform/media) expand the group that owns the screen.
  useEffect(() => {
    const parent = NAV.flatMap((g) => g.items).find((it) => it.subs?.some((x) => x.screen === screen?.id));
    if (parent) toggleNavGroup(parent.id, true);
  }, [screen?.id, toggleNavGroup]);

  // Show the thin scrollbar only while the nav is scrolling.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      el.setAttribute('data-scrolling', '');
      clearTimeout(t);
      t = setTimeout(() => el.removeAttribute('data-scrolling'), 700);
    };
    el.addEventListener('scroll', onScroll, true);
    return () => {
      el.removeEventListener('scroll', onScroll, true);
      clearTimeout(t);
    };
  }, []);

  const visible = (id: Parameters<typeof pathOf>[0]) => can(screenById[id].permission);
  // Hover/focus is a strong signal the user is about to navigate: fetch the page's code + data now.
  const intent = (id: ScreenId) => ({ onMouseEnter: () => preloadScreen(id), onFocus: () => preloadScreen(id) });

  return (
    <aside className="sidebar" ref={ref} aria-label="Console navigation">
      <Link to="/" className="sb-brand" onClick={closeMobile} aria-label="Coursiva platform console — home">
        <div className="sb-logo" aria-hidden="true">
          C
        </div>
        <div className="min0">
          <div className="sb-name">Coursiva</div>
          <div className="sb-tag">Platform console</div>
        </div>
      </Link>
      <nav className="sb-nav">
        {NAV.map((grp) => {
          const items = grp.items
            .map((it) => ({ ...it, subs: it.subs?.filter((s) => visible(s.screen)) }))
            .filter((it) => (it.screen ? visible(it.screen) : (it.subs?.length ?? 0) > 0));
          if (!items.length) return null;
          return (
            <div key={grp.label}>
              <div className="sb-group-label" id={`nav-${grp.label}`}>
                {grp.label}
              </div>
              <ul className="sb-items" aria-labelledby={`nav-${grp.label}`}>
                {items.map((it) => {
                  if (it.screen) {
                    const badge = it.id === 'support' ? (badges?.support ?? 0) : 0;
                    return (
                      <li key={it.id}>
                        <NavLink
                          {...intent(it.screen)}
                          to={pathOf(it.screen)}
                          end={it.screen === 'overview'}
                          onClick={closeMobile}
                          className={({ isActive }) => cx('sb-item', isActive && 'is-active')}
                        >
                          <Icon d={it.icon} />
                          <span className="sb-item-label">{it.label}</span>
                          {badge > 0 && (
                            <span className="sb-badge" aria-label={`${badge} open tickets`}>
                              {badge}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    );
                  }
                  const subs = it.subs ?? [];
                  const active = subs.some((s) => s.screen === screen?.id);
                  const open = navOpen.includes(it.id);
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        className={cx('sb-item', active && 'is-active')}
                        aria-expanded={open}
                        aria-controls={`nav-sub-${it.id}`}
                        onClick={() => toggleNavGroup(it.id)}
                      >
                        <Icon d={it.icon} />
                        <span className="sb-item-label">{it.label}</span>
                        <span className={cx('sb-chev', open && 'is-open')} aria-hidden="true">
                          ▶
                        </span>
                      </button>
                      {open && (
                        <ul className="sb-subs" id={`nav-sub-${it.id}`}>
                          {subs.map((s) => (
                            <li key={s.screen}>
                              <NavLink
                                {...intent(s.screen)}
                                to={pathOf(s.screen)}
                                onClick={closeMobile}
                                className={({ isActive }) => cx('sb-sub', isActive && 'is-active')}
                              >
                                <i aria-hidden="true" />
                                {s.label}
                              </NavLink>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      {user && (
        <div className="sb-user">
          <Avatar text={initials(user.name)} color={avatarColor(user.id)} size={30} round fontSize={12} />
          <div className="min0">
            <div className="sb-user-name ellipsis">{user.name}</div>
            <div className="sb-user-role">{user.role === 'Owner' ? 'Platform owner' : user.role}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
