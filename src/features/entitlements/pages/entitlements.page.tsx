import { Link } from 'react-router-dom';
import { Bar, Card, ConfirmButton, Dot, Empty, QueryState, Screen, SkeletonRows, Toggle, TRow } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { PLANS, type LimitKey } from '@/lib/domain';
import { money, num, plural } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useEntitlements, usePlanLimits, useResetEntitlements, useSetEntitlements } from '../api';
import type { EntitlementCell, EntitlementMatrix, EntitlementModule, PlanLimit } from '../types';

const COLS = 'minmax(0,1.8fr) repeat(3, minmax(0,90px))';
const MIN = 520;
const NOTE =
  'Source of truth for what a tenant sees. Turning a module off hides its nav item and blocks its routes for every tenant on that plan.';
const ADDON_NOTE =
  'Modules marked EXTENSION are sold in the extension catalogue. Which plans get one free is set there — the ticks below follow it, and an override here wins for that plan only.';
const LIMIT_NOTE = 'Every limit here can be overridden per tenant in the tenant drawer — 0 means unlimited.';
const TAG_STYLE = { background: 'transparent', padding: '1px 5px', flexShrink: 0 } as const;

const LIMIT_ROW_LABELS: Record<LimitKey, string> = {
  students: 'Students',
  storageGb: 'Storage',
  staffSeats: 'Staff seats',
  apiPerMinute: 'API req/min',
  liveRoomMinutes: 'Live room minutes',
  courses: 'Courses',
};

function formatLimit(key: LimitKey, v: number) {
  if (key === 'liveRoomMinutes') return v ? `${num(v)}/mo` : 'BYO only';
  if (v === 0) return 'Unlimited';
  if (key === 'storageGb') return v >= 1000 ? `${num(v / 1000)} TB` : `${num(v)} GB`;
  return num(v);
}

function PlanHead({ first, sticky }: { first: string; sticky?: boolean }) {
  return (
    <TRow
      cols={COLS}
      min={MIN}
      head
      style={{ gap: 10, padding: '12px 0 8px', ...(sticky ? { position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 } : {}) }}
    >
      <div role="columnheader">{first}</div>
      {PLANS.map((p) => (
        <div key={p} role="columnheader" style={{ textAlign: 'center' }}>
          {p}
        </div>
      ))}
    </TRow>
  );
}

function extensionTip(m: EntitlementModule) {
  const x = m.extension;
  if (!x) return '';
  const incl = x.includedPlans.length ? `free on ${x.includedPlans.join(', ')}` : 'paid on every plan';
  return `${x.name} · ${money(x.price)}/mo · ${incl} — ${
    x.gatesModule ? 'the L/G/S toggles in Extensions drive these ticks' : 'an upsell inside this module, so it does not change access here'
  }`;
}

function ModuleRow({ m }: { m: EntitlementModule }) {
  const can = useCan();
  const set = useSetEntitlements();
  const manage = can('platform.manage');
  const toggle = (c: EntitlementCell) => {
    const enabled = !c.enabled;
    set.mutate([{ moduleId: m.id, plan: c.plan, enabled }], {
      onSuccess: () => toast(`${m.label} ${enabled ? 'added to' : 'removed from'} ${c.plan} — tenant dashboards update on next load`),
    });
  };
  const tip = extensionTip(m);
  return (
    <TRow cols={COLS} min={MIN} style={{ gap: 10, padding: '9px 0' }}>
      <div role="rowheader" className="min0 hstack">
        <span className="ellipsis">{m.label}</span>
        {m.core && (
          <span className="badge badge--tag faint" style={{ ...TAG_STYLE, border: '1px solid var(--bd)' }}>
            CORE
          </span>
        )}
        {m.extension && (
          <span className="badge badge--tag fg-accent" title={tip} style={{ ...TAG_STYLE, border: '1px solid var(--ac)', cursor: 'help' }}>
            {m.extension.gatesModule ? 'EXTENSION' : 'UPSELL'}
            <span className="sr-only"> — {tip}</span>
          </span>
        )}
      </div>
      {m.cells.map((c) => (
        <div key={c.plan} role="cell" className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
          <Toggle
            on={c.enabled}
            label={m.core ? `${m.label} on ${c.plan} (core)` : `${m.label} on ${c.plan}`}
            disabled={m.core || !manage}
            onChange={() => toggle(c)}
          />
          <span style={{ width: 5, flexShrink: 0 }}>
            {c.overridden && <Dot tone="warn" size={5} label="Overridden from the plan default" />}
          </span>
        </div>
      ))}
    </TRow>
  );
}

function Summary({ m }: { m: EntitlementMatrix }) {
  const can = useCan();
  const reset = useResetEntitlements();
  const [f, setF] = useUrlState({ q: '' });
  return (
    <Card>
      <div className="hstack wrap" style={{ gap: 10 }}>
        <h2 className="card-title" style={{ minWidth: 180, flex: 1 }}>
          What each plan unlocks
        </h2>
        <input
          className="input"
          type="search"
          style={{ width: 180, padding: '8px 11px', fontSize: 12.5 }}
          value={f.q}
          onChange={(e) => setF({ q: e.target.value })}
          placeholder="Find a module…"
          aria-label="Find a module"
        />
        {m.overrideCount > 0 && can('platform.manage') && (
          <ConfirmButton
            className="btn btn--sm"
            confirmLabel="Confirm reset"
            pending={reset.isPending}
            onConfirm={() =>
              reset.mutate(undefined, {
                onSuccess: () => toast(`Reset ${plural(m.overrideCount, 'override')} — every plan is back to its defaults`),
              })
            }
          >
            Reset to defaults
          </ConfirmButton>
        )}
      </div>
      <p className="muted t-sm" style={{ marginTop: 4, lineHeight: 1.55 }}>
        {NOTE}
      </p>
      <ul
        className="plain-list"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, marginTop: 14 }}
      >
        {m.plans.map((p) => (
          <li key={p.plan} className="card card--inset" style={{ borderColor: 'var(--bd)', padding: '12px 14px' }}>
            <div className="t-sm" style={{ fontWeight: 700 }}>
              {p.plan}
            </div>
            <div className="muted t-xs" style={{ marginTop: 2 }}>
              {p.enabled} of {p.total} modules
            </div>
            <Bar size="thin" value={p.total ? Math.round((p.enabled / p.total) * 100) : 0} style={{ marginTop: 8, flex: 'none' }} />
          </li>
        ))}
      </ul>
      <div className="faint t-xs" style={{ marginTop: 10 }}>
        {m.overrideCount ? `${plural(m.overrideCount, 'override')} from plan defaults` : 'Matching plan defaults'}
      </div>
      <p className="faint t-xs" style={{ marginTop: 6, lineHeight: 1.5 }}>
        {ADDON_NOTE}
      </p>
    </Card>
  );
}

function Matrix({ m }: { m: EntitlementMatrix }) {
  const [f, setF] = useUrlState({ q: '' });
  const needle = f.q.trim().toLowerCase();
  const groups = [...new Set(m.modules.map((x) => x.group))]
    .map((group) => ({
      group,
      mods: m.modules.filter((x) => x.group === group && (!needle || `${x.label} ${x.id}`.toLowerCase().includes(needle))),
    }))
    .filter((g) => g.mods.length);
  return (
    <div className="card table-scroll" style={{ padding: '6px 20px 14px' }}>
      <div role="table" aria-label="Plan entitlements">
        <PlanHead first="Module" sticky />
        {groups.length === 0 && (
          <Empty
            action={
              <button type="button" className="btn btn--sm" onClick={() => setF({ q: '' })}>
                Clear search
              </button>
            }
          >
            No module matches “{f.q}”
          </Empty>
        )}
        {groups.map((g) => (
          <div key={g.group} role="rowgroup" aria-label={g.group}>
            <div role="row">
              <div
                role="cell"
                className="eyebrow fg-accent"
                style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', padding: '14px 0 6px' }}
              >
                {g.group}
              </div>
            </div>
            {g.mods.map((x) => (
              <ModuleRow key={x.id} m={x} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Limits({ rows }: { rows: PlanLimit[] }) {
  return (
    <section className="card table-scroll" aria-labelledby="ent-limits-title">
      <h2 id="ent-limits-title" className="card-title">
        Limits by plan
      </h2>
      <p className="muted t-sm" style={{ marginTop: 3 }}>
        {LIMIT_NOTE} Live room minutes are edited in{' '}
        <Link className="link" to={pathOf('media')}>
          Video &amp; storage
        </Link>
        .
      </p>
      <div role="table" aria-label="Limits by plan" style={{ marginTop: 8 }}>
        <PlanHead first="Limit" />
        {rows.map((r) => (
          <TRow key={r.key} cols={COLS} min={MIN} style={{ gap: 10, padding: '10px 0' }}>
            <div role="rowheader" style={{ fontWeight: 600 }}>
              {LIMIT_ROW_LABELS[r.key]}
            </div>
            {r.values.map((v) => (
              <div key={v.plan} role="cell" className="muted" style={{ textAlign: 'center' }}>
                {formatLimit(r.key, v.value)}
              </div>
            ))}
          </TRow>
        ))}
      </div>
    </section>
  );
}

export default function EntitlementsPage() {
  const matrix = useEntitlements();
  const limits = usePlanLimits();
  return (
    <Screen max={1000} label="Plan entitlements">
      <QueryState
        query={matrix}
        skeleton={
          <Card>
            <SkeletonRows rows={12} h={20} />
          </Card>
        }
      >
        {(m) => (
          <>
            <Summary m={m} />
            <Matrix m={m} />
          </>
        )}
      </QueryState>
      <QueryState
        query={limits}
        skeleton={
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        }
      >
        {(rows) => <Limits rows={rows} />}
      </QueryState>
    </Screen>
  );
}
