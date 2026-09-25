import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import {
  Badge,
  Bar,
  Card,
  Empty,
  ErrorState,
  Field,
  FormError,
  Input,
  KpiRow,
  Screen,
  Select,
  SkeletonRows,
  Spinner,
  TRow,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import type { Tone } from '@/lib/domain';
import { moneyFine, num, toneFg } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useAiUsage, useSetAiThrottle, useUpdateAiSettings } from '../api';
import { KpiSkeletons } from '../components/charts';
import { t as tPlain, useT } from '../i18n';
import { ROUTING_POLICIES, type AiFeature, type AiTenantUsage, type AiUsage, type RoutingPolicy } from '../types';

const featureLabel = (f: AiFeature) => tPlain(`ai.feature.${f}`);
const routingLabel = (p: RoutingPolicy) => tPlain(`ai.routing.${p}`);
const COLS = 'minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,0.8fr) minmax(0,0.7fr) minmax(0,0.8fr)';
const marginTone = (m: number | null): Tone => (m == null ? 'flat' : m < 40 ? 'bad' : m < 70 ? 'warn' : 'good');

const capSchema = z.object({
  monthlyCap: z
    .string()
    .trim()
    .regex(/^\d+$/, { error: () => tPlain('ai.cap.wholeDollars') })
    .transform(Number)
    .refine((n) => n >= 100 && n <= 100_000, { error: () => tPlain('ai.cap.range') }),
});

function CapCard({ ai }: { ai: AiUsage }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const allowed = can('billing.manage');
  const save = useUpdateAiSettings();
  const route = useUpdateAiSettings();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(capSchema, { defaultValues: { monthlyCap: String(ai.settings.monthlyCap) } });
  const { reset } = form;
  useEffect(() => reset({ monthlyCap: String(ai.settings.monthlyCap) }), [ai.settings.monthlyCap, reset]);

  const onSubmit = form.handleSubmit(({ monthlyCap }) => {
    setFormError(null);
    save.mutate(
      { monthlyCap },
      {
        onSuccess: (d) => toast(t('ai.cap.saved', { amount: moneyFine(d.settings.monthlyCap) })),
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  const ratio = ai.totals.capUsedPct;
  const allowances = ai.pricing.allowances
    .map((a) => t('ai.cap.allowance', { plan: tc(`enums.plan.${a.plan}`), tokens: a.tokensK }))
    .join(' · ');

  return (
    <Card title={t('ai.cap.title')} right={<span className="card-sub">{t('ai.cap.usedThisMonth', { pct: ratio })}</span>}>
      <div className="hstack wrap" style={{ gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="hstack wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label={t('ai.cap.field')} error={form.formState.errors.monthlyCap?.message}>
            {(p) => <Input {...p} {...form.register('monthlyCap')} inputMode="numeric" style={{ width: 130 }} disabled={!allowed} />}
          </Field>
          {allowed && (
            <button type="submit" className="btn btn--sm" disabled={save.isPending || !form.formState.isDirty} style={{ marginBottom: 1 }}>
              {save.isPending && <Spinner />} {t('ai.cap.save')}
            </button>
          )}
        </form>
        <div style={{ marginLeft: 'auto', maxWidth: '100%' }}>
          <label className="field-label" htmlFor="ai-routing">
            {t('ai.cap.routingPolicy')}
          </label>
          <Select<RoutingPolicy>
            id="ai-routing"
            value={ai.settings.routingPolicy}
            options={ROUTING_POLICIES.map((p) => [p, routingLabel(p)] as const)}
            disabled={!allowed || route.isPending}
            style={{ width: 'auto', maxWidth: '100%' }}
            onChange={(routingPolicy) => route.mutate({ routingPolicy }, { onSuccess: () => toast(t('ai.cap.routingSaved')) })}
          />
        </div>
      </div>
      <FormError>{formError}</FormError>
      <Bar
        value={Math.min(100, ratio)}
        color={toneFg(ratio > 90 ? 'bad' : ratio > 70 ? 'warn' : 'accent')}
        size="md"
        style={{ marginTop: 14 }}
        label={t('ai.cap.barLabel', { pct: ratio })}
      />
      <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5 }}>
        {t('ai.cap.explainer', { allowances, cost: moneyFine(ai.pricing.costPer1k), billed: moneyFine(ai.pricing.billedPer1k) })}
        {!allowed && ` ${t('ai.cap.noPermission')}`}
      </p>
    </Card>
  );
}

function TenantTable({ rows }: { rows: AiTenantUsage[] }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const throttle = useSetAiThrottle();
  const allowed = can('billing.manage');
  if (!rows.length) return <Empty>{t('ai.table.empty')}</Empty>;
  return (
    <div role="table" aria-label={t('ai.table.label')}>
      <TRow cols={COLS} min={600} head style={{ gap: 10 }}>
        <div role="columnheader">{t('ai.table.tenant')}</div>
        <div role="columnheader">{t('ai.table.heaviestFeature')}</div>
        <div role="columnheader">{t('ai.table.tokensUsed')}</div>
        <div role="columnheader">{t('ai.table.ourCost')}</div>
        <div role="columnheader">{t('ai.table.margin')}</div>
        <div role="columnheader" aria-label={t('ai.table.modelSpeed')} />
      </TRow>
      {rows.map((r) => (
        <TRow key={r.tenantId} cols={COLS} min={600} style={{ gap: 10, padding: '11px 0', fontSize: 12.5 }}>
          <div role="cell" className="min0">
            <div className="ellipsis" style={{ fontWeight: 600 }}>
              {can('tenants.view') ? (
                <Link to={`/tenants/${r.tenantId}`} style={{ color: 'inherit' }}>
                  {r.name}
                </Link>
              ) : (
                r.name
              )}
            </div>
            <div className="faint" style={{ fontSize: 11 }}>
              {tc(`enums.plan.${r.plan}`)}
            </div>
          </div>
          <div role="cell" className="muted ellipsis">
            {featureLabel(r.topFeature)}
          </div>
          <div role="cell" className="min0">
            <div className="nowrap">{t('ai.table.tokensOf', { tokens: r.tokensK, allowance: r.allowanceK })}</div>
            <div className={r.billed ? 'fg-warn ellipsis' : 'faint ellipsis'} style={{ fontSize: 11 }}>
              {r.billed ? t('ai.table.billed', { amount: moneyFine(r.billed) }) : t('ai.table.withinAllowance')}
            </div>
          </div>
          <div role="cell" style={{ fontWeight: 700 }}>
            {moneyFine(r.cost)}
          </div>
          <div role="cell">
            <Badge tone={marginTone(r.marginPct)}>{r.marginPct == null ? t('ai.table.noRevenue') : `${r.marginPct}%`}</Badge>
          </div>
          <div role="cell" style={{ textAlign: 'right' }}>
            {allowed ? (
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={r.throttled}
                aria-label={t('ai.table.throttleLabel', { name: r.name })}
                disabled={throttle.isPending && throttle.variables.tenantId === r.tenantId}
                onClick={() =>
                  throttle.mutate(
                    { tenantId: r.tenantId, throttled: !r.throttled },
                    {
                      onSuccess: () =>
                        toast(r.throttled ? t('ai.table.unthrottled', { name: r.name }) : t('ai.table.throttledToast', { name: r.name })),
                    },
                  )
                }
              >
                {r.throttled ? t('ai.table.throttled') : t('ai.table.throttle')}
              </button>
            ) : (
              r.throttled && <Badge tone="warn">{t('ai.table.throttled')}</Badge>
            )}
          </div>
        </TRow>
      ))}
    </div>
  );
}

function SpendByFeature({ rows }: { rows: AiUsage['byFeature'] }) {
  const t = useT();
  return (
    <figure style={{ margin: 0 }}>
      <div className="stack" style={{ gap: 10, marginTop: 6 }} aria-hidden="true">
        {rows.map((f) => (
          <div key={f.feature}>
            <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>{featureLabel(f.feature)}</span>
              <span style={{ fontWeight: 700 }}>{moneyFine(f.cost)}</span>
            </div>
            <Bar value={f.sharePct} style={{ marginTop: 5 }} />
          </div>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>{t('ai.byFeature.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('ai.byFeature.feature')}</th>
              <th scope="col">{t('ai.byFeature.cost')}</th>
              <th scope="col">{t('ai.byFeature.share')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.feature}>
                <th scope="row">{featureLabel(f.feature)}</th>
                <td>{moneyFine(f.cost)}</td>
                <td>{f.sharePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default function AiPage() {
  const t = useT();
  const q = useAiUsage();
  const ai = q.data;

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label={t('ai.title')}>
      {ai ? (
        <KpiRow
          items={[
            {
              label: t('ai.kpis.spend'),
              value: moneyFine(ai.totals.spend),
              sub: t('ai.kpis.spendSub', { cap: moneyFine(ai.settings.monthlyCap), pct: ai.totals.capUsedPct }),
            },
            {
              label: t('ai.kpis.tokens'),
              value: t('ai.kpis.tokensValue', { tokens: ai.totals.tokensK }),
              sub: t('ai.kpis.tokensSub', { count: ai.totals.tenants }),
            },
            {
              label: t('ai.kpis.costPerTenant'),
              value: moneyFine(ai.totals.tenants ? ai.totals.spend / ai.totals.tenants : 0),
              sub: t('ai.kpis.costPerTenantSub', { amount: moneyFine(ai.pricing.billedPer1k) }),
            },
            { label: t('ai.kpis.throttled'), value: num(ai.totals.throttled), sub: t('ai.kpis.throttledSub') },
          ]}
        />
      ) : (
        <KpiSkeletons n={4} />
      )}

      {ai ? <CapCard ai={ai} /> : <SkeletonRows rows={3} h={24} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card title={t('ai.usageByTenant')} className="table-scroll" style={{ flex: '1.6 1 560px', minWidth: 0 }}>
          {ai ? <TenantTable rows={ai.tenants} /> : <SkeletonRows rows={7} h={22} />}
        </Card>
        <Card title={t('ai.byFeature.title')} style={{ flex: '1 1 300px', minWidth: 0 }}>
          {ai ? (
            ai.byFeature.length ? (
              <SpendByFeature rows={ai.byFeature} />
            ) : (
              <Empty>{t('ai.byFeature.empty')}</Empty>
            )
          ) : (
            <SkeletonRows rows={4} h={22} />
          )}
        </Card>
      </div>
    </Screen>
  );
}
