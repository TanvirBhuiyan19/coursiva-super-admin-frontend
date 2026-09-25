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
import { money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useExtensionSettings, useExtensionSummary, useExtensions, useUpdateExtensionSettings } from '../api';
import { CommitNumberInput } from '@/components/ui';
import { ExtensionCatalogueTable } from '../components/ExtensionCatalogue';
import { t, useT } from '../i18n';
import { EXTENSION_TRIAL_DAYS, type ExtensionSettings, type ExtensionTrialDays } from '../types';

const trialText = (d: number) => (d ? t('bundle.trialDays', { days: d }) : t('bundle.noTrial'));
const trialOptions = () => EXTENSION_TRIAL_DAYS.map((d) => [String(d), trialText(d)] as const);

function Kpis() {
  const t = useT();
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
        { label: t('kpis.mrr'), value: money(s.mrr), sub: t('kpis.mrrSub', { paying: s.payingInstalls, free: s.freeInstalls }) },
        {
          label: t('kpis.attachRate'),
          value: t('kpis.percent', { pct: s.attachPct }),
          sub: t('kpis.attachRateSub', { withAny: s.tenantsWithAny, tenants: s.tenants }),
        },
        {
          label: t('kpis.avgPerTenant'),
          value: t('kpis.perMonth', { amount: money(s.avgPerTenant) }),
          sub: t('kpis.avgPerTenantSub', { count: s.extensions }),
        },
        { label: t('kpis.trialToPaid'), value: t('kpis.percent', { pct: s.trialConversionPct }), sub: t('kpis.trialToPaidSub') },
      ]}
    />
  );
}

function BundleCard({ s }: { s: ExtensionSettings }) {
  const t = useT();
  const can = useCan();
  const update = useUpdateExtensionSettings();
  const manage = can('billing.manage');
  return (
    <Card title={t('bundle.title')} style={{ padding: '18px 20px' }}>
      <div className="muted t-sm">{t('bundle.intro')}</div>
      <div className="hstack wrap" style={{ gap: 12, marginTop: 14 }}>
        {manage ? (
          <CommitNumberInput
            key={s.bundlePrice}
            prefix={t('catalogue.currencyPrefix')}
            suffix={t('bundle.perMonthSuffix')}
            value={s.bundlePrice}
            min={1}
            max={9999}
            label={t('bundle.priceLabel')}
            rangeMessage={t('bundle.priceRange')}
            style={{ width: 78, fontSize: 15, fontWeight: 700 }}
            onCommit={(bundlePrice) =>
              update.mutate(
                { bundlePrice },
                {
                  onSuccess: (n) => toast(t('bundle.priceToast', { price: money(n.bundlePrice), pct: n.bundleDiscountPct })),
                },
              )
            }
          />
        ) : (
          <span className="display" style={{ fontSize: 17, fontWeight: 800 }}>
            {t('bundle.perMonth', { amount: money(s.bundlePrice) })}
          </span>
        )}
        <div className="muted t-sm">
          {t('bundle.versusBefore')} <b style={{ color: 'var(--tx)' }}>{money(s.separatePrice)}</b> {t('bundle.versusAfter')}
        </div>
        <Badge pill tone="good">
          {s.separatePrice ? t('bundle.discount', { pct: s.bundleDiscountPct }) : '—'}
        </Badge>
      </div>
      <div className="hstack wrap" style={{ gap: 10, marginTop: 14 }}>
        <label className="t-sm" style={{ fontWeight: 600 }} htmlFor="ext-trial">
          {t('bundle.trialLabel')}
        </label>
        <Select
          id="ext-trial"
          style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}
          value={String(s.trialDays)}
          options={trialOptions()}
          disabled={!manage || update.isPending}
          onChange={(v) => {
            const trialDays = Number(v) as ExtensionTrialDays;
            update.mutate(
              { trialDays },
              {
                onSuccess: () => toast(trialDays ? t('bundle.trialToast', { days: trialDays }) : t('bundle.trialOffToast')),
              },
            );
          }}
        />
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        {t('bundle.note')}
      </p>
    </Card>
  );
}

function RulesCard({ s }: { s: ExtensionSettings }) {
  const t = useT();
  const can = useCan();
  const update = useUpdateExtensionSettings();
  return (
    <Card title={t('rules.title')} style={{ padding: '18px 20px' }}>
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
                { onSuccess: () => toast(t(enabled ? 'rules.onToast' : 'rules.offToast', { label: r.label })) },
              )
            }
          />
        ))}
      </div>
      <p className="note" style={{ marginTop: 12 }}>
        {t('rules.note')}
      </p>
    </Card>
  );
}

export default function ExtensionsPage() {
  const t = useT();
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
      toast(t('page.exported'));
    } catch {
      toast(t('page.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen max={1250} label={t('page.screenLabel')}>
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
              {t('page.catalogueTitle')}
            </h2>
            {list.data && <span className="faint t-xs">{t('page.categories', { count: categories })}</span>}
            <div className="spacer" />
            <button type="button" className="btn btn--sm" disabled={exporting} onClick={() => void exportCsv()}>
              {exporting ? t('page.exporting') : t('page.exportRevenue')}
            </button>
          </div>
          {list.isPending ? (
            <SkeletonRows rows={8} h={26} />
          ) : rows.length === 0 ? (
            <Empty>{t('page.empty')}</Empty>
          ) : (
            <ExtensionCatalogueTable rows={rows} />
          )}
        </section>
      )}

      <div className="grid-2">
        <QueryState query={settings} skeleton={<Card>{<SkeletonRows rows={4} />}</Card>}>
          {(s) => <BundleCard s={s} />}
        </QueryState>

        <Card title={t('page.mostInstalled')} style={{ padding: '18px 20px' }}>
          {list.isPending ? (
            <SkeletonRows rows={5} />
          ) : top.length === 0 ? (
            <Empty>{t('page.noInstalls')}</Empty>
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
                    {t('page.installedTenants', { count: r.installs })} · {t('page.attach', { pct: r.attachPct })}
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
