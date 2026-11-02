import { Link } from 'react-router-dom';
import { Badge, Card, ChipGroup, Dot, Empty, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { num } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useAvailability, usePlatformConnections } from '../api';
import { useT } from '../i18n';
import { AvailabilityToggle } from '../components/AvailabilityToggle';
import type { Availability, Capability, PlatformConnection } from '../types';

const FILTERS = ['all', 'available', 'off', 'notConnected'] as const;
type Filter = (typeof FILTERS)[number];
type Status = Exclude<Filter, 'all'>;

/** The switch decides "Off"; a switched-on capability whose services aren't connected is "Not connected". */
const statusOf = (c: Capability): Status => (!c.on ? 'off' : c.available ? 'available' : 'notConnected');
const TONE = { available: 'good', off: 'flat', notConnected: 'warn' } as const;

const matches = (c: Capability, q: string) =>
  !q || [c.label, c.key, c.description, ...c.modules, ...c.requires.map((r) => r.label)].some((s) => s.toLowerCase().includes(q));

/** Media-screen services (storage, DRM, Mux) aren't on Connections; everything else links to its Connections tab. */
function connectHref(keys: string[], connections: PlatformConnection[] | undefined) {
  const kind = connections?.find((x) => keys.includes(x.key))?.kind;
  return kind ? `${pathOf('connections')}?section=${kind}` : connections ? pathOf('media') : pathOf('connections');
}

function Row({ c, connections }: { c: Capability; connections: PlatformConnection[] | undefined }) {
  const t = useT();
  const status = statusOf(c);
  const missing = c.requires.filter((r) => !r.connected);
  const names = missing.map((r) => r.label).join(', ');
  return (
    <li className="row" style={{ alignItems: 'flex-start', gap: 14, padding: '12px 0' }}>
      <div className="min0" style={{ flex: 1 }}>
        <div className="hstack wrap" style={{ gap: '4px 8px' }}>
          <h3 style={{ fontWeight: 650, fontSize: 13, margin: 0 }}>{c.label}</h3>
          <Badge tone={TONE[status]} xs pill style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Dot tone={TONE[status]} size={6} />
            {t(`availability.status.${status}`)}
          </Badge>
        </div>
        <p className="t-xs muted" style={{ margin: '3px 0 0', lineHeight: 1.45 }}>
          {c.description}
        </p>
        <div className="t-xs faint hstack wrap" style={{ gap: '2px 14px', marginTop: 5 }}>
          <span>{c.schoolsUsing == null ? t('availability.usageUnknown') : t('availability.usedBy', { count: c.schoolsUsing })}</span>
          {!!c.payingSchools && <span>{t('availability.paying', { count: c.payingSchools })}</span>}
          {status === 'notConnected' && missing.length > 0 && (
            <Link
              className="link"
              to={connectHref(
                missing.map((r) => r.key),
                connections,
              )}
            >
              {c.requiresAny ? t('availability.connectAny', { names }) : t('availability.connect', { names })}
            </Link>
          )}
        </div>
      </div>
      <div style={{ paddingTop: 1 }}>
        <AvailabilityToggle capability={c} />
      </div>
    </li>
  );
}

function Group({ label, list, connections }: { label: string; list: Capability[]; connections: PlatformConnection[] | undefined }) {
  const t = useT();
  const total = list.length;
  const on = list.filter((c) => c.on).length;
  return (
    <Card
      title={label}
      right={
        <span className="t-xs muted nowrap" style={{ fontWeight: 600 }}>
          {t('availability.groupOn', { on: num(on), total: num(total) })}
        </span>
      }
    >
      <ul className="plain-list">
        {list.map((c) => (
          <Row key={c.key} c={c} connections={connections} />
        ))}
      </ul>
    </Card>
  );
}

function Catalogue({ a }: { a: Availability }) {
  const t = useT();
  const connections = usePlatformConnections().data;
  const [f, setF] = useUrlState({ q: '', show: 'all' });
  const show: Filter = (FILTERS as readonly string[]).includes(f.show) ? (f.show as Filter) : 'all';
  const q = f.q.trim().toLowerCase();
  const counts = Object.fromEntries(FILTERS.map((k) => [k, k === 'all' ? a.capabilities.length : 0])) as Record<Filter, number>;
  a.capabilities.forEach((c) => (counts[statusOf(c)] += 1));
  const shown = a.capabilities.filter((c) => matches(c, q) && (show === 'all' || statusOf(c) === show));
  const groups = a.groups.map((g) => ({ ...g, list: shown.filter((c) => c.group === g.key) })).filter((g) => g.list.length);
  return (
    <>
      {/* The finder stays in view while the long list scrolls under it. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 4, background: 'var(--pg)', margin: '-12px 0 -4px', padding: '12px 0 4px' }}>
        <Card tight>
          <div className="hstack wrap" style={{ gap: '10px 14px' }}>
            <input
              className="input"
              type="search"
              style={{ flex: '1 1 240px', minWidth: 0, padding: '8px 11px', fontSize: 12.5 }}
              value={f.q}
              onChange={(e) => setF({ q: e.target.value })}
              placeholder={t('availability.findPlaceholder')}
              aria-label={t('availability.findLabel')}
            />
            <ChipGroup
              label={t('availability.filterLabel')}
              size="sm"
              options={FILTERS.map(
                (k) => [k, t('availability.filterCount', { label: t(`availability.filter.${k}`), count: num(counts[k]) })] as const,
              )}
              value={show}
              onChange={(v) => setF({ show: v })}
            />
          </div>
          {/* The chips carry the counts on screen; screen readers hear how many rows the finder left. */}
          <div className="sr-only" aria-live="polite">
            {t('availability.summary', { shown: num(shown.length), total: num(a.capabilities.length) })}
          </div>
        </Card>
      </div>
      {groups.length ? (
        groups.map((g) => <Group key={g.key} label={g.label} list={g.list} connections={connections} />)
      ) : (
        <Card>
          <Empty
            action={
              <button type="button" className="btn btn--sm" onClick={() => setF({ q: '', show: 'all' })}>
                {t('availability.clear')}
              </button>
            }
          >
            {q ? t('availability.noMatches', { q: f.q.trim() }) : t('availability.noMatchesFilter')}
          </Empty>
        </Card>
      )}
    </>
  );
}

export default function AvailabilityPage() {
  const t = useT();
  const query = useAvailability();
  return (
    <Screen max={1100} label={t('availability.screenLabel')}>
      <Card>
        <p className="t-sm muted" style={{ margin: 0, lineHeight: 1.55 }}>
          {t('availability.intro')}{' '}
          <Link to={pathOf('connections')} className="link">
            {t('availability.connectionsLink')}
          </Link>
        </p>
      </Card>
      <QueryState query={query} skeleton={<SkeletonRows rows={8} />}>
        {(a) => <Catalogue a={a} />}
      </QueryState>
    </Screen>
  );
}
