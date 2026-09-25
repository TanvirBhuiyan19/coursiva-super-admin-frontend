import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SCREENS, type ScreenDef } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { useGlobalSearch, type SearchType } from '@/features/shell/api';
import { useT } from '@/features/shell/i18n';
import { useDebounced } from '@/lib/useDebounced';
import { useUi } from '@/store/ui';
import { Modal } from '../ui';

type Group = 'Recent' | 'Action' | 'Screen' | 'Tenant' | 'Invoice' | 'Ticket' | 'Staff';
interface Item {
  key: string;
  label: string;
  sub?: string;
  glyph: string;
  group: Group;
  run: () => void;
}

const PREFIX: Record<string, Group> = { '>': 'Action', '/': 'Screen', '@': 'Tenant', $: 'Invoice', '#': 'Ticket', '~': 'Staff' };
const SCOPES = Object.keys(PREFIX);
const ORDER: Group[] = ['Recent', 'Action', 'Screen', 'Tenant', 'Invoice', 'Ticket', 'Staff'];
const REMOTE: Partial<Record<Group, SearchType>> = { Tenant: 'tenant', Invoice: 'invoice', Ticket: 'ticket', Staff: 'staff' };
const GLYPH: Record<SearchType, string> = { tenant: '◉', invoice: '$', ticket: '✉', staff: '☺' };
const GROUP_OF: Record<SearchType, Group> = { tenant: 'Tenant', invoice: 'Invoice', ticket: 'Ticket', staff: 'Staff' };
/** Keyboard keys shown in hints (not translated). */
const KEYS = { enter: '↵', arrows: '↑↓', esc: 'esc', toggle: '⌘K' };

export default function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const can = useCan();
  const { set: setUi, toggleUiMode, pushRecent } = useUi.getState();
  const recent = useUi((s) => s.cmdRecent);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const close = () => setUi({ cmdOpen: false });

  const raw = q.trim();
  const scope = PREFIX[raw[0] ?? ''] ?? null;
  const term = (scope ? raw.slice(1) : raw).trim();
  const debounced = useDebounced(term, 180);
  const remoteType = scope ? REMOTE[scope] : undefined;
  const wantsRemote = scope ? !!remoteType : debounced.length > 0;
  const search = useGlobalSearch(wantsRemote ? debounced : '', remoteType);

  const local = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const actions: Item[] = [
      ...(can('tenants.manage')
        ? [
            {
              key: 'a:new',
              label: t('palette.actions.newTenant'),
              glyph: '⚡',
              group: 'Action' as const,
              run: () => setUi({ provisionOpen: true }),
            },
          ]
        : []),
      ...(can('announcements.send')
        ? [{ key: 'a:ann', label: t('palette.actions.announce'), glyph: '⚡', group: 'Action' as const, run: go('/announcements') }]
        : []),
      ...(can('platform.view')
        ? [{ key: 'a:status', label: t('palette.actions.incident'), glyph: '⚡', group: 'Action' as const, run: go('/platform/flags') }]
        : []),
      { key: 'a:theme', label: t('palette.actions.theme'), glyph: '⚡', group: 'Action', run: toggleUiMode },
    ];
    const screens: Item[] = (SCREENS as readonly ScreenDef[])
      .filter((s) => can(s.permission))
      .map((s) => ({ key: 's:' + s.id, label: s.title, glyph: '→', group: 'Screen', run: go(s.path) }));
    return [...actions, ...screens];
  }, [can, navigate, setUi, toggleUiMode, t]);

  const lower = term.toLowerCase();
  // Until the debounced search catches up, the remote results belong to an older query: narrow them to what's typed
  // now, so a fast "type + Enter" can never open a result that doesn't match.
  const stale = debounced !== term;
  const remote: Item[] = (wantsRemote ? (search.data ?? []) : [])
    .filter((r) => !stale || `${r.label} ${r.sublabel}`.toLowerCase().includes(lower))
    .map((r) => ({
      key: `${r.type}:${r.id}`,
      label: r.label,
      sub: r.sublabel,
      glyph: GLYPH[r.type],
      group: GROUP_OF[r.type],
      run: () => navigate(r.href),
    }));

  let items: Item[];
  if (scope && !remoteType) items = local.filter((i) => i.group === scope && (!lower || i.label.toLowerCase().includes(lower)));
  else if (scope) items = remote;
  else if (lower) items = [...local.filter((i) => i.label.toLowerCase().includes(lower)), ...remote];
  else {
    const recents = recent
      .map((k) => local.find((i) => i.key === k))
      .filter((i): i is Item => !!i)
      .map((i) => ({ ...i, group: 'Recent' as const }));
    items = [...recents, ...local.filter((i) => i.group === 'Action' || i.group === 'Screen')];
  }
  const ordered = ORDER.flatMap((g) => items.filter((i) => i.group === g)).slice(0, 12);
  const selIdx = ordered.length ? Math.min(sel, ordered.length - 1) : 0;
  const loading = wantsRemote && search.isFetching && !search.data;

  const run = (item: Item) => {
    if (item.group !== 'Tenant' && item.group !== 'Invoice' && item.group !== 'Ticket' && item.group !== 'Staff') pushRecent(item.key);
    close();
    item.run();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((n) => Math.min(n + 1, Math.max(0, ordered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((n) => Math.max(0, n - 1));
    } else if (e.key === 'Enter' && ordered[selIdx]) {
      e.preventDefault();
      run(ordered[selIdx]);
    }
  };
  const optionId = (i: number) => `cmd-opt-${i}`;

  return (
    <Modal onClose={close} width={560} top label={t('palette.label')}>
      <div className="cmdk">
        <input
          data-autofocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKey}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.searchLabel')}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={ordered.length ? optionId(selIdx) : undefined}
          aria-autocomplete="list"
          className="cmdk-input"
        />
        <div className="hstack wrap cmdk-scopes">
          {SCOPES.map((k) => (
            <button
              key={k}
              type="button"
              className={'chip chip--xs' + (raw[0] === k ? ' is-on' : '')}
              onClick={() => {
                setQ(k);
                setSel(0);
              }}
            >
              <b className="mono">{k}</b> {t(`palette.groups.${PREFIX[k]!}`)}
            </button>
          ))}
          <div className="spacer" />
          <span className="faint nowrap" style={{ fontSize: 11 }} aria-live="polite">
            {loading ? t('palette.searching') : t('palette.resultCount', { count: ordered.length })}
          </span>
        </div>
        <div className="cmdk-list" id="cmd-list" role="listbox" aria-label={t('palette.results')}>
          {ordered.map((item, idx) => {
            const header = idx === 0 || ordered[idx - 1]!.group !== item.group ? t(`palette.groups.${item.group}`) : null;
            const on = idx === selIdx;
            return (
              <div key={item.group + item.key}>
                {header && (
                  <div className="cmdk-group" role="presentation">
                    {header}
                  </div>
                )}
                {/* ARIA combobox: focus stays in the input and options are announced via aria-activedescendant. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
                <div
                  id={optionId(idx)}
                  role="option"
                  aria-selected={on}
                  className={'cmdk-item' + (on ? ' is-on' : '')}
                  onClick={() => run(item)}
                  onMouseEnter={() => setSel(idx)}
                >
                  <span className="cmdk-glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  <span className="min0" style={{ flex: 1 }}>
                    <span className="ellipsis" style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
                      {item.label}
                    </span>
                    {item.sub && (
                      <span className="ellipsis faint" style={{ display: 'block', fontSize: 11.5 }}>
                        {item.sub}
                      </span>
                    )}
                  </span>
                  {on && <kbd className="kbd">{KEYS.enter}</kbd>}
                  <span className="cmdk-kind">{t(`palette.kinds.${item.group}`)}</span>
                </div>
              </div>
            );
          })}
          {!ordered.length && !loading && <div className="empty">{t('palette.noMatches')}</div>}
        </div>
        <div className="cmdk-foot faint">
          <span>
            <b>{KEYS.arrows}</b> {t('palette.hints.navigate')}
          </span>
          <span>
            <b>{KEYS.enter}</b> {t('palette.hints.open')}
          </span>
          <span>
            <b>{KEYS.esc}</b> {t('palette.hints.close')}
          </span>
          <span>
            <b>{KEYS.toggle}</b> {t('palette.hints.toggle')}
          </span>
        </div>
      </div>
    </Modal>
  );
}
