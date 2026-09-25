import { useState } from 'react';
import {
  Badge,
  Bar,
  Card,
  Empty,
  ErrorState,
  KpiRow,
  QueryState,
  Screen,
  Select,
  Skeleton,
  SkeletonRows,
  ToggleRow,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { api } from '@/lib/api/client';
import { money, plural } from '@/lib/format';
import { toast } from '@/store/ui';
import { useExtensionSettings, useExtensionSummary, useExtensions, useUpdateExtensionSettings } from '../api';
import { CommitNumberInput } from '@/components/ui';
import { ExtensionCatalogueTable } from '../components/ExtensionCatalogue';
import { EXTENSION_TRIAL_DAYS, type ExtensionSettings, type ExtensionTrialDays } from '../types';

const BUNDLE_NOTE =
  'Tenants who add four or more extensions are prompted to switch to the bundle — it protects margin and reduces churn on individual add-ons.';
const GRANT_NOTE =
  'Toggle L / G / S on any extension to include it free for every tenant on that plan. One-off comps for a single tenant are set in the tenant drawer and show as “Comped by staff” on their invoice.';

const trialText = (d: number) => (d ? `${d} days` : 'No trial');
const TRIAL_OPTIONS = EXTENSION_TRIAL_DAYS.map((d) => [String(d), trialText(d)] as const);

function Kpis() {
  const q = useExtensionSummary();
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="grid-kpi">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card card--tight">
            <Skeleton h={12} w="40%" />
            <Skeleton h={24} w="60%" style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  const s = q.data;
  return (
    <KpiRow
      items={[
        { label: 'Extension MRR', value: money(s.mrr), sub: `${s.payingInstalls} paying · ${s.freeInstalls} free by plan` },
        { label: 'Attach rate', value: `${s.attachPct}%`, sub: `${s.tenantsWithAny} of ${s.tenants} tenants run at least one` },
        { label: 'Avg per tenant', value: `${money(s.avgPerTenant)}/mo`, sub: `Across ${plural(s.extensions, 'extension')}` },
        { label: 'Trial → paid', value: `${s.trialConversionPct}%`, sub: 'Extension trials, no card needed' },
      ]}
    />
  );
}

function BundleCard({ s }: { s: ExtensionSettings }) {
  const can = useCan();
  const update = useUpdateExtensionSettings();
  const manage = can('billing.manage');
  return (
    <Card title="All-access bundle" style={{ padding: '18px 20px' }}>
      <div className="muted t-sm">One price for every extension — the upgrade path off à-la-carte add-ons.</div>
      <div className="hstack wrap" style={{ gap: 12, marginTop: 14 }}>
        {manage ? (
          <CommitNumberInput
            key={s.bundlePrice}
            prefix="$"
            suffix="/mo"
            value={s.bundlePrice}
            min={1}
            max={9999}
            label="Bundle price per month"
            rangeMessage="Whole dollars, $1–$9,999"
            style={{ width: 78, fontSize: 15, fontWeight: 700 }}
            onCommit={(bundlePrice) =>
              update.mutate(
                { bundlePrice },
                {
                  onSuccess: (n) =>
                    toast(`All-access bundle is now ${money(n.bundlePrice)}/mo — ${n.bundleDiscountPct}% off buying separately`),
                },
              )
            }
          />
        ) : (
          <span className="display" style={{ fontSize: 17, fontWeight: 800 }}>
            {money(s.bundlePrice)}/mo
          </span>
        )}
        <div className="muted t-sm">
          vs <b style={{ color: 'var(--tx)' }}>{money(s.separatePrice)}</b> bought separately
        </div>
        <Badge pill tone="good">
          {s.separatePrice ? `${s.bundleDiscountPct}% off` : '—'}
        </Badge>
      </div>
      <div className="hstack wrap" style={{ gap: 10, marginTop: 14 }}>
        <label className="t-sm" style={{ fontWeight: 600 }} htmlFor="ext-trial">
          Free trial on every extension
        </label>
        <Select
          id="ext-trial"
          style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}
          value={String(s.trialDays)}
          options={TRIAL_OPTIONS}
          disabled={!manage || update.isPending}
          onChange={(v) => {
            const trialDays = Number(v) as ExtensionTrialDays;
            update.mutate(
              { trialDays },
              {
                onSuccess: () =>
                  toast(
                    trialDays ? `Trial length is now ${trialDays} days for every extension` : 'Extensions no longer offer a free trial',
                  ),
              },
            );
          }}
        />
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        {BUNDLE_NOTE}
      </p>
    </Card>
  );
}

function RulesCard({ s }: { s: ExtensionSettings }) {
  const can = useCan();
  const update = useUpdateExtensionSettings();
  return (
    <Card title="Selling rules" style={{ padding: '18px 20px' }}>
      <div className="stack">
        {s.rules.map((r) => (
          <ToggleRow
            key={r.key}
            label={r.label}
            sub={r.description}
            on={r.enabled}
            disabled={!can('billing.manage')}
            onChange={(enabled) =>
              update.mutate(
                { rules: [{ key: r.key, enabled }] },
                { onSuccess: () => toast(`${r.label} — ${enabled ? 'on for every extension' : 'turned off'}`) },
              )
            }
          />
        ))}
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        {GRANT_NOTE}
      </p>
    </Card>
  );
}

export default function ExtensionsPage() {
  const list = useExtensions();
  const settings = useExtensionSettings();
  const [exporting, setExporting] = useState(false);
  const rows = list.data ?? [];
  const top = [...rows].sort((a, b) => b.installs - a.installs).slice(0, 5);
  const categories = new Set(rows.map((r) => r.category)).size;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download('/extensions/export', undefined, 'extension-revenue.csv');
      toast('Extension revenue exported — installs, MRR and attach per extension');
    } catch {
      toast('Export failed — try again', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen max={1250} label="Extensions and add-ons">
      <Kpis />

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <section
          className="card table-scroll"
          style={{ padding: '6px 18px 4px' }}
          aria-labelledby="ext-cat-title"
          aria-busy={list.isFetching}
        >
          <div className="hstack wrap" style={{ alignItems: 'baseline', gap: 10, padding: '14px 0 10px' }}>
            <h2 id="ext-cat-title" className="card-title" style={{ flex: 'none' }}>
              Extension catalogue
            </h2>
            {list.data && <span className="faint t-xs">{plural(categories, 'category', 'categories')}</span>}
            <div className="spacer" />
            <button type="button" className="btn btn--sm" disabled={exporting} onClick={() => void exportCsv()}>
              {exporting ? 'Exporting…' : 'Export revenue'}
            </button>
          </div>
          {list.isPending ? (
            <SkeletonRows rows={8} h={26} />
          ) : rows.length === 0 ? (
            <Empty>No extensions in the catalogue yet.</Empty>
          ) : (
            <ExtensionCatalogueTable rows={rows} />
          )}
        </section>
      )}

      <div className="grid-2">
        <QueryState query={settings} skeleton={<Card>{<SkeletonRows rows={4} />}</Card>}>
          {(s) => <BundleCard s={s} />}
        </QueryState>

        <Card title="Most installed" style={{ padding: '18px 20px' }}>
          {list.isPending ? (
            <SkeletonRows rows={5} />
          ) : top.length === 0 ? (
            <Empty>No installs yet.</Empty>
          ) : (
            <ol className="plain-list">
              {top.map((r) => (
                <li key={r.key} style={{ padding: '10px 0', borderBottom: '1px solid var(--bd2)', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span className="ellipsis min0" style={{ fontWeight: 600 }}>
                      {r.name}
                    </span>
                    <b className="nowrap">{money(r.mrr)}</b>
                  </div>
                  <Bar size="thin" value={r.attachPct} style={{ marginTop: 6, flex: 'none' }} />
                  <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
                    {plural(r.installs, 'tenant')} · {r.attachPct}% attach
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <QueryState query={settings} skeleton={<Card>{<SkeletonRows rows={4} />}</Card>}>
          {(s) => <RulesCard s={s} />}
        </QueryState>
      </div>
    </Screen>
  );
}
