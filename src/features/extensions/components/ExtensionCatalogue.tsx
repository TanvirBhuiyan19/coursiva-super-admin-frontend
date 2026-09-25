import { Badge, Bar, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { PLAN_RANK, PLANS, type Plan, type Tone } from '@/lib/domain';
import { money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useSetExtensionPlans, useUpdateExtension } from '../api';
import type { Extension, ExtensionStatus } from '../types';
import { CommitNumberInput } from '@/components/ui';

const COLS = 'minmax(0,2.2fr) minmax(0,0.9fr) minmax(0,1.5fr) minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.1fr) minmax(0,1fr)';
const MIN = 920;
const STATUS_TONE: Record<ExtensionStatus, Tone> = { Live: 'good', Beta: 'warn', Hidden: 'flat' };

const inclusionLabel = (plans: Plan[]) =>
  plans.length === PLANS.length ? 'Free on every plan' : plans.length ? `Free on ${plans.join(', ')}` : 'Paid on every plan';

function PlanToggles({ row }: { row: Extension }) {
  const can = useCan();
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
              ? `${row.name} is now charged on ${p} — existing installs keep it until their next renewal`
              : `${row.name} is free for every ${p} tenant from now — anyone already paying stops being billed`,
          ),
      },
    );
  };
  return (
    <div>
      <div role="group" aria-label={`Plans that get ${row.name} free`} style={{ display: 'flex', gap: 4 }}>
        {PLANS.map((p) => {
          const on = row.includedPlans.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={on}
              aria-label={`Free on ${p}: ${row.name}`}
              title={on ? `${row.name} is free for ${p} tenants` : `Charge ${p} tenants for ${row.name}`}
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
              <span aria-hidden="true">{p.charAt(0)}</span>
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
            prefix="$"
            value={row.price}
            min={1}
            max={999}
            label={`${row.name} price per month`}
            rangeMessage="Whole dollars, $1–$999"
            onCommit={(price) =>
              update.mutate(
                { key: row.key, price },
                { onSuccess: () => toast(`${row.name} is now ${money(price)}/mo — new installs and renewals bill the new price`) },
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
          {row.payingInstalls} paying{row.freeInstalls ? ` · ${row.freeInstalls} free` : ''}
        </div>
      </div>
      <div role="cell">
        <div style={{ fontWeight: 700 }}>{money(row.mrr)}</div>
        <Bar value={row.attachPct} style={{ height: 4, marginTop: 5, flex: 'none' }} label={`${row.name} attach rate ${row.attachPct}%`} />
        <div className="faint" style={{ fontSize: 10.5, marginTop: 3 }}>
          {row.attachPct}% attach
        </div>
      </div>
      <div role="cell" className="hstack wrap">
        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
        {manage && (
          <button
            type="button"
            className={row.hidden ? 'link' : 'link link--muted'}
            style={{ fontSize: 11 }}
            aria-label={`${row.hidden ? 'Publish' : 'Hide'} ${row.name}`}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { key: row.key, hidden: !row.hidden },
                {
                  onSuccess: () =>
                    toast(
                      row.hidden
                        ? `${row.name} is back in the catalogue`
                        : `${row.name} hidden — existing installs keep working, nobody new can add it`,
                    ),
                },
              )
            }
          >
            {row.hidden ? 'Publish' : 'Hide'}
          </button>
        )}
      </div>
    </TRow>
  );
}

export function ExtensionCatalogueTable({ rows }: { rows: Extension[] }) {
  return (
    <div role="table" aria-label="Extension catalogue">
      <TRow cols={COLS} min={MIN} head style={{ gap: 10, padding: '9px 0' }}>
        {['Extension', 'Category', 'Free for plan', 'Price / mo', 'Installs', 'Attach · MRR', 'Status'].map((h) => (
          <div key={h} role="columnheader">
            {h}
          </div>
        ))}
      </TRow>
      {rows.map((r) => (
        <CatalogueRow key={r.key} row={r} />
      ))}
    </div>
  );
}
