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
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useAiUsage, useSetAiThrottle, useUpdateAiSettings } from '../api';
import { KpiSkeletons } from '../components/charts';
import { ROUTING_POLICIES, type AiFeature, type AiTenantUsage, type AiUsage, type RoutingPolicy } from '../types';

const FEATURE_LABEL: Record<AiFeature, string> = {
  outlines: 'Course outlines',
  quizzes: 'Quiz generation',
  summaries: 'Lesson summaries',
  chat: 'Chat assistant',
};
const ROUTING_LABEL: Record<RoutingPolicy, string> = {
  cost_first: 'Cost-first · GPT-mini for outlines',
  balanced: 'Balanced · frontier for quizzes only',
  quality_first: 'Quality-first · frontier everywhere',
};
const COLS = 'minmax(0,1.7fr) minmax(0,1.2fr) minmax(0,0.9fr) minmax(0,0.8fr) minmax(0,0.7fr) minmax(0,0.8fr)';
const marginTone = (m: number | null): Tone => (m == null ? 'flat' : m < 40 ? 'bad' : m < 70 ? 'warn' : 'good');

const capSchema = z.object({
  monthlyCap: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter the cap in whole dollars.')
    .transform(Number)
    .refine((n) => n >= 100 && n <= 100_000, 'Set a cap between $100 and $100,000.'),
});

function CapCard({ ai }: { ai: AiUsage }) {
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
        onSuccess: (d) =>
          toast(`AI cap set to ${moneyFine(d.settings.monthlyCap)}/month — requests route to the cheap model once it’s reached`),
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  const ratio = ai.totals.capUsedPct;
  const allowances = ai.pricing.allowances.map((a) => `${a.plan} ${num(a.tokensK)}k`).join(' · ');

  return (
    <Card title="Monthly cost cap" right={<span className="card-sub">{ratio}% used this month</span>}>
      <div className="hstack wrap" style={{ gap: 12, alignItems: 'flex-start', marginTop: 4 }}>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="hstack wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Cap in dollars per month" error={form.formState.errors.monthlyCap?.message}>
            {(p) => <Input {...p} {...form.register('monthlyCap')} inputMode="numeric" style={{ width: 130 }} disabled={!allowed} />}
          </Field>
          {allowed && (
            <button type="submit" className="btn btn--sm" disabled={save.isPending || !form.formState.isDirty} style={{ marginBottom: 1 }}>
              {save.isPending && <Spinner />} Save cap
            </button>
          )}
        </form>
        <div style={{ marginLeft: 'auto', maxWidth: '100%' }}>
          <label className="field-label" htmlFor="ai-routing">
            Model routing policy
          </label>
          <Select<RoutingPolicy>
            id="ai-routing"
            value={ai.settings.routingPolicy}
            options={ROUTING_POLICIES.map((p) => [p, ROUTING_LABEL[p]] as const)}
            disabled={!allowed || route.isPending}
            style={{ width: 'auto', maxWidth: '100%' }}
            onChange={(routingPolicy) =>
              route.mutate({ routingPolicy }, { onSuccess: () => toast('Routing policy saved — applies to new requests immediately') })
            }
          />
        </div>
      </div>
      <FormError>{formError}</FormError>
      <Bar
        value={Math.min(100, ratio)}
        color={toneFg(ratio > 90 ? 'bad' : ratio > 70 ? 'warn' : 'accent')}
        size="md"
        style={{ marginTop: 14 }}
        label={`AI spend: ${ratio}% of the monthly cap`}
      />
      <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0', lineHeight: 1.5 }}>
        Each plan includes an AI allowance ({allowances} tokens). Tokens cost us {moneyFine(ai.pricing.costPer1k)} per 1k and are billed to
        the tenant at {moneyFine(ai.pricing.billedPer1k)} per 1k above their allowance — margin is revenue (plan + billed overage) minus
        that cost. Throttling routes a tenant to the cheap model instead of cutting them off.
        {!allowed && ' You need billing permissions to change the cap, routing or throttles.'}
      </p>
    </Card>
  );
}

function TenantTable({ rows }: { rows: AiTenantUsage[] }) {
  const can = useCan();
  const throttle = useSetAiThrottle();
  const allowed = can('billing.manage');
  if (!rows.length) return <Empty>No tenant has used AI this month.</Empty>;
  return (
    <div role="table" aria-label="AI usage by tenant">
      <TRow cols={COLS} min={600} head style={{ gap: 10 }}>
        <div role="columnheader">Tenant</div>
        <div role="columnheader">Heaviest feature</div>
        <div role="columnheader">Tokens used</div>
        <div role="columnheader">Our cost</div>
        <div role="columnheader">AI margin</div>
        <div role="columnheader" aria-label="Model speed" />
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
              {r.plan}
            </div>
          </div>
          <div role="cell" className="muted ellipsis">
            {FEATURE_LABEL[r.topFeature]}
          </div>
          <div role="cell" className="min0">
            <div className="nowrap">
              {num(r.tokensK)}k of {num(r.allowanceK)}k
            </div>
            <div className={r.billed ? 'fg-warn ellipsis' : 'faint ellipsis'} style={{ fontSize: 11 }}>
              {r.billed ? `+${moneyFine(r.billed)} billed` : 'Within allowance'}
            </div>
          </div>
          <div role="cell" style={{ fontWeight: 700 }}>
            {moneyFine(r.cost)}
          </div>
          <div role="cell">
            <Badge tone={marginTone(r.marginPct)}>{r.marginPct == null ? 'No revenue' : `${r.marginPct}%`}</Badge>
          </div>
          <div role="cell" style={{ textAlign: 'right' }}>
            {allowed ? (
              <button
                type="button"
                className="btn btn--sm"
                aria-pressed={r.throttled}
                aria-label={`Throttle ${r.name}`}
                disabled={throttle.isPending && throttle.variables.tenantId === r.tenantId}
                onClick={() =>
                  throttle.mutate(
                    { tenantId: r.tenantId, throttled: !r.throttled },
                    {
                      onSuccess: () =>
                        toast(
                          r.throttled
                            ? `${r.name} back to full AI speed`
                            : `${r.name} throttled to the cheap model — they keep working, you keep margin`,
                        ),
                    },
                  )
                }
              >
                {r.throttled ? 'Throttled' : 'Throttle'}
              </button>
            ) : (
              r.throttled && <Badge tone="warn">Throttled</Badge>
            )}
          </div>
        </TRow>
      ))}
    </div>
  );
}

function SpendByFeature({ rows }: { rows: AiUsage['byFeature'] }) {
  return (
    <figure style={{ margin: 0 }}>
      <div className="stack" style={{ gap: 10, marginTop: 6 }} aria-hidden="true">
        {rows.map((f) => (
          <div key={f.feature}>
            <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>{FEATURE_LABEL[f.feature]}</span>
              <span style={{ fontWeight: 700 }}>{moneyFine(f.cost)}</span>
            </div>
            <Bar value={f.sharePct} style={{ marginTop: 5 }} />
          </div>
        ))}
      </div>
      <div className="sr-only">
        <table>
          <caption>AI spend by feature this month</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Cost</th>
              <th scope="col">Share of spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.feature}>
                <th scope="row">{FEATURE_LABEL[f.feature]}</th>
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
  const q = useAiUsage();
  const ai = q.data;

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label="AI usage and cost">
      {ai ? (
        <KpiRow
          items={[
            {
              label: 'AI spend · MTD',
              value: moneyFine(ai.totals.spend),
              sub: `Cap ${moneyFine(ai.settings.monthlyCap)} · ${ai.totals.capUsedPct}% used`,
            },
            { label: 'Tokens used', value: `${num(ai.totals.tokensK)}k`, sub: `Across ${num(ai.totals.tenants)} tenants` },
            {
              label: 'Cost per tenant',
              value: moneyFine(ai.totals.tenants ? ai.totals.spend / ai.totals.tenants : 0),
              sub: `Overage billed at ${moneyFine(ai.pricing.billedPer1k)} per 1k`,
            },
            { label: 'Throttled', value: num(ai.totals.throttled), sub: 'Routed to the cheap model' },
          ]}
        />
      ) : (
        <KpiSkeletons n={4} />
      )}

      {ai ? <CapCard ai={ai} /> : <SkeletonRows rows={3} h={24} />}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card title="Usage by tenant · this month" className="table-scroll" style={{ flex: '1.6 1 560px', minWidth: 0 }}>
          {ai ? <TenantTable rows={ai.tenants} /> : <SkeletonRows rows={7} h={22} />}
        </Card>
        <Card title="Spend by feature" style={{ flex: '1 1 300px', minWidth: 0 }}>
          {ai ? (
            ai.byFeature.length ? (
              <SpendByFeature rows={ai.byFeature} />
            ) : (
              <Empty>No AI spend yet.</Empty>
            )
          ) : (
            <SkeletonRows rows={4} h={22} />
          )}
        </Card>
      </div>
    </Screen>
  );
}
