import { Badge, Bar, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { PLAN_RANK, PLANS, type Plan, type Tone } from '@/lib/domain';
import { money } from '@/lib/format';
import { t as tc, useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useSetExtensionPlans, useUpdateExtension } from '../api';
import { t, useT } from '../i18n';
import type { Extension, ExtensionStatus } from '../types';
import { CommitNumberInput } from '@/components/ui';

const COLS = 'minmax(0,2.2fr) minmax(0,0.9fr) minmax(0,1.5fr) minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1fr)';
const MIN = 920;
const COLUMNS = ['extension', 'category', 'freeForPlan', 'price', 'installs', 'attachMrr', 'status'] as const;
const STATUS_TONE: Record<ExtensionStatus, Tone> = { Live: 'good', Beta: 'warn', Hidden: 'flat' };

const planLabel = (p: Plan) => tc(`enums.plan.${p}`);
const inclusionLabel = (plans: Plan[]) =>
  plans.length === PLANS.length
    ? t('catalogue.freeOnEvery')
    : plans.length
      ? t('catalogue.freeOn', { plans: plans.map(planLabel).join(t('catalogue.planSeparator')) })
      : t('catalogue.paidOnEvery');

function PlanToggles({ row }: { row: Extension }) {
  const can = useCan();
  const t = useT();
  const tc = useCommonT();
  const setPlans = useSetExtensionPlans();
  const toggle = (p: Plan) => {
    const on = row.includedPlans.includes(p);
    const plans = on ? row.includedPlans.filter((x) => x !== p) : [...row.includedPlans, p].sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
    setPlans.mutate(
      { key: row.key, plans },
      {
        onSuccess: () =>
          toast(
            on
              ? t('catalogue.nowCharged', { name: row.name, plan: tc(`enums.plan.${p}`) })
              : t('catalogue.nowFree', { name: row.name, plan: tc(`enums.plan.${p}`) }),
          ),
      },
    );
  };
  return (
    <div>
      <div role="group" aria-label={t('catalogue.plansGroup', { name: row.name })} style={{ display: 'flex', gap: 4 }}>
        {PLANS.map((p) => {
          const on = row.includedPlans.includes(p);
          const plan = tc(`enums.plan.${p}`);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              aria-label={t('catalogue.freeOnPlan', { plan, name: row.name })}
              title={on ? t('catalogue.isFreeFor', { name: row.name, plan }) : t('catalogue.chargeFor', { plan, name: row.name })}
              disabled={!can('billing.manage') || setPlans.isPending}
              onClick={() => toggle(p)}
              style={{
                width: 26,
                height: 24,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 800,
                cursor: can('billing.manage') ? 'pointer' : 'default',
                border: `1px solid ${on ? 'var(--gFg)' : 'var(--bd)'}`,
                background: on ? 'var(--gTint)' : 'var(--card)',
                color: on ? 'var(--gFg)' : 'var(--tx4)',
              }}
            >
              <span aria-hidden="true">{plan.charAt(0)}</span>
            </button>
          );
        })}
      </div>
      <div className="faint" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.35 }}>
        {inclusionLabel(row.includedPlans)}
      </div>
    </div>
  );
}

function CatalogueRow({ row }: { row: Extension }) {
  const can = useCan();
  const t = useT();
  const update = useUpdateExtension();
  const manage = can('billing.manage');
  return (
    <TRow cols={COLS} min={MIN} style={{ gap: 10, padding: '12px 0', fontSize: 12.5 }}>
      <div role="cell" className="min0">
        <div className="t-strong" style={{ fontWeight: 700 }}>
          {row.name}
        </div>
        <div className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
          {row.blurb}
        </div>
      </div>
      <div role="cell" className="muted">
        {row.category}
      </div>
      <div role="cell">
        <PlanToggles row={row} />
      </div>
      <div role="cell">
        {manage ? (
          <CommitNumberInput
            key={row.price}
            prefix={t('catalogue.currencyPrefix')}
            value={row.price}
            min={1}
            max={999}
            label={t('catalogue.priceLabel', { name: row.name })}
            rangeMessage={t('catalogue.priceRange')}
            onCommit={(price) =>
              update.mutate(
                { key: row.key, price },
                { onSuccess: () => toast(t('catalogue.priceToast', { name: row.name, price: money(price) })) },
              )
            }
          />
        ) : (
          <span style={{ fontWeight: 600 }}>{money(row.price)}</span>
        )}
      </div>
      <div role="cell">
        <div style={{ fontWeight: 700 }}>{row.installs}</div>
        <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
          {t('catalogue.paying', { count: row.payingInstalls })}
          {row.freeInstalls ? t('catalogue.free', { count: row.freeInstalls }) : ''}
        </div>
      </div>
      <div role="cell">
        <div style={{ fontWeight: 700 }}>{money(row.mrr)}</div>
        <Bar
          value={row.attachPct}
          style={{ height: 4, marginTop: 5, flex: 'none' }}
          label={t('catalogue.attachLabel', { name: row.name, pct: row.attachPct })}
        />
        <div className="faint" style={{ fontSize: 10.5, marginTop: 3 }}>
          {t('catalogue.attach', { pct: row.attachPct })}
        </div>
      </div>
      <div role="cell" className="hstack wrap">
        <Badge tone={STATUS_TONE[row.status]}>{t(`enums.status.${row.status}`)}</Badge>
        {manage && (
          <button
            type="button"
            className={row.hidden ? 'link' : 'link link--muted'}
            style={{ fontSize: 11 }}
            aria-label={t(row.hidden ? 'catalogue.publishLabel' : 'catalogue.hideLabel', { name: row.name })}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { key: row.key, hidden: !row.hidden },
                {
                  onSuccess: () =>
                    toast(row.hidden ? t('catalogue.published', { name: row.name }) : t('catalogue.hidden', { name: row.name })),
                },
              )
            }
          >
            {row.hidden ? t('catalogue.publish') : t('catalogue.hide')}
          </button>
        )}
      </div>
    </TRow>
  );
}

export function ExtensionCatalogueTable({ rows }: { rows: Extension[] }) {
  const t = useT();
  return (
    <div role="table" aria-label={t('catalogue.table')}>
      <TRow cols={COLS} min={MIN} head style={{ gap: 10, padding: '9px 0' }}>
        {COLUMNS.map((h) => (
          <div key={h} role="columnheader">
            {t(`catalogue.cols.${h}`)}
          </div>
        ))}
      </TRow>
      {rows.map((r) => (
        <CatalogueRow key={r.key} row={r} />
      ))}
    </div>
  );
}
