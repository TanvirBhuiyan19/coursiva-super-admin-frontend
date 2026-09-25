import { Link } from 'react-router-dom';
import { Bar, Card, ConfirmButton, Dot, Empty, QueryState, Screen, SkeletonRows, Toggle, TRow } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { PLANS, type LimitKey } from '@/lib/domain';
import { money, num } from '@/lib/format';
import { t as common, useT as useCommonT } from '@/lib/i18n/common';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useEntitlements, usePlanLimits, useResetEntitlements, useSetEntitlements } from '../api';
import { t as msg, useT } from '../i18n';
import type { EntitlementCell, EntitlementMatrix, EntitlementModule, PlanLimit } from '../types';

const COLS = 'minmax(0,1.8fr) repeat(3, minmax(0,90px))';
const MIN = 520;
const TAG_STYLE = { background: 'transparent', padding: '1px 5px', flexShrink: 0 } as const;

function formatLimit(key: LimitKey, v: number) {
  if (key === 'liveRoomMinutes') return v ? msg('limits.perMonth', { value: v }) : msg('limits.byoOnly');
  if (v === 0) return common('states.unlimited');
  if (key === 'storageGb') return v >= 1000 ? msg('limits.tb', { value: v / 1000 }) : msg('limits.gb', { value: v });
  return num(v);
}

function PlanHead({ first, sticky }: { first: string; sticky?: boolean }) {
  const tc = useCommonT();
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
          {tc(`enums.plan.${p}`)}
        </div>
      ))}
    </TRow>
  );
}

function extensionTip(m: EntitlementModule) {
  const x = m.extension;
  if (!x) return '';
  const incl = x.includedPlans.length
    ? msg('matrix.tip.freeOn', { plans: x.includedPlans.map((p) => common(`enums.plan.${p}`)).join(', ') })
    : msg('matrix.tip.paidEverywhere');
  return msg('matrix.tip.full', {
    name: x.name,
    price: money(x.price),
    included: incl,
    effect: x.gatesModule ? msg('matrix.tip.gates') : msg('matrix.tip.upsell'),
  });
}

function ModuleRow({ m }: { m: EntitlementModule }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const set = useSetEntitlements();
  const manage = can('platform.manage');
  const toggle = (c: EntitlementCell) => {
    const enabled = !c.enabled;
    set.mutate([{ moduleId: m.id, plan: c.plan, enabled }], {
      onSuccess: () => toast(t(enabled ? 'matrix.added' : 'matrix.removed', { module: m.label, plan: tc(`enums.plan.${c.plan}`) })),
    });
  };
  const tip = extensionTip(m);
  return (
    <TRow cols={COLS} min={MIN} style={{ gap: 10, padding: '9px 0' }}>
      <div role="rowheader" className="min0 hstack">
        <span className="ellipsis">{m.label}</span>
        {m.core && (
          <span className="badge badge--tag faint" style={{ ...TAG_STYLE, border: '1px solid var(--bd)' }}>
            {t('matrix.core')}
          </span>
        )}
        {m.extension && (
          <span className="badge badge--tag fg-accent" title={tip} style={{ ...TAG_STYLE, border: '1px solid var(--ac)', cursor: 'help' }}>
            {m.extension.gatesModule ? t('matrix.extension') : t('matrix.upsell')}
            <span className="sr-only"> — {tip}</span>
          </span>
        )}
      </div>
      {m.cells.map((c) => (
        <div key={c.plan} role="cell" className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
          <Toggle
            on={c.enabled}
            label={t(m.core ? 'matrix.toggleCore' : 'matrix.toggle', { module: m.label, plan: tc(`enums.plan.${c.plan}`) })}
            disabled={m.core || !manage}
            onChange={() => toggle(c)}
          />
          <span style={{ width: 5, flexShrink: 0 }}>{c.overridden && <Dot tone="warn" size={5} label={t('matrix.overridden')} />}</span>
        </div>
      ))}
    </TRow>
  );
}

function Summary({ m }: { m: EntitlementMatrix }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const reset = useResetEntitlements();
  const [f, setF] = useUrlState({ q: '' });
  return (
    <Card>
      <div className="hstack wrap" style={{ gap: 10 }}>
        <h2 className="card-title" style={{ minWidth: 180, flex: 1 }}>
          {t('summary.title')}
        </h2>
        <input
          className="input"
          type="search"
          style={{ width: 180, padding: '8px 11px', fontSize: 12.5 }}
          value={f.q}
          onChange={(e) => setF({ q: e.target.value })}
          placeholder={t('summary.findPlaceholder')}
          aria-label={t('summary.findLabel')}
        />
        {m.overrideCount > 0 && can('platform.manage') && (
          <ConfirmButton
            className="btn btn--sm"
            confirmLabel={t('summary.confirmReset')}
            pending={reset.isPending}
            onConfirm={() =>
              reset.mutate(undefined, {
                onSuccess: () => toast(t('summary.resetDone', { count: m.overrideCount })),
              })
            }
          >
            {t('summary.resetToDefaults')}
          </ConfirmButton>
        )}
      </div>
      <p className="muted t-sm" style={{ marginTop: 4, lineHeight: 1.55 }}>
        {t('summary.note')}
      </p>
      <ul
        className="plain-list"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, marginTop: 14 }}
      >
        {m.plans.map((p) => (
          <li key={p.plan} className="card card--inset" style={{ borderColor: 'var(--bd)', padding: '12px 14px' }}>
            <div className="t-sm" style={{ fontWeight: 700 }}>
              {tc(`enums.plan.${p.plan}`)}
            </div>
            <div className="muted t-xs" style={{ marginTop: 2 }}>
              {t('summary.planModules', { enabled: p.enabled, total: p.total })}
            </div>
            <Bar size="thin" value={p.total ? Math.round((p.enabled / p.total) * 100) : 0} style={{ marginTop: 8, flex: 'none' }} />
          </li>
        ))}
      </ul>
      <div className="faint t-xs" style={{ marginTop: 10 }}>
        {m.overrideCount ? t('summary.overrides', { count: m.overrideCount }) : t('summary.matchingDefaults')}
      </div>
      <p className="faint t-xs" style={{ marginTop: 6, lineHeight: 1.5 }}>
        {t('summary.addonNote')}
      </p>
    </Card>
  );
}

function Matrix({ m }: { m: EntitlementMatrix }) {
  const t = useT();
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
      <div role="table" aria-label={t('matrix.label')}>
        <PlanHead first={t('matrix.module')} sticky />
        {groups.length === 0 && (
          <Empty
            action={
              <button type="button" className="btn btn--sm" onClick={() => setF({ q: '' })}>
                {t('matrix.clearSearch')}
              </button>
            }
          >
            {t('matrix.noMatch', { query: f.q })}
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
  const t = useT();
  return (
    <section className="card table-scroll" aria-labelledby="ent-limits-title">
      <h2 id="ent-limits-title" className="card-title">
        {t('limits.title')}
      </h2>
      <p className="muted t-sm" style={{ marginTop: 3 }}>
        {t('limits.note')} {t('limits.liveRoomEditedIn')}{' '}
        <Link className="link" to={pathOf('media')}>
          {t('limits.mediaLink')}
        </Link>
        .
      </p>
      <div role="table" aria-label={t('limits.title')} style={{ marginTop: 8 }}>
        <PlanHead first={t('limits.limit')} />
        {rows.map((r) => (
          <TRow key={r.key} cols={COLS} min={MIN} style={{ gap: 10, padding: '10px 0' }}>
            <div role="rowheader" style={{ fontWeight: 600 }}>
              {t(`limits.rows.${r.key}`)}
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
  const t = useT();
  const matrix = useEntitlements();
  const limits = usePlanLimits();
  return (
    <Screen max={1000} label={t('title')}>
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
