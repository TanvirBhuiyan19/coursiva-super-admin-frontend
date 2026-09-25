import { useState } from 'react';
import { z } from 'zod';
import { Badge, Card, ConfirmButton, Empty, ErrorState, FormError, QueryState, Screen, SkeletonRows, Spinner, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { PLANS, type Plan } from '@/lib/domain';
import { formatDateTime, num, sevTone, timeAgo } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useAbuseSignals, useBlockIp, useBlockedIps, useRateLimits, useResolveSignal, useSetRateLimits, useUnblockIp } from '../api';
import { IP_ERROR, isIpOrCidr } from '../ip';
import type { AbuseSignal, RateLimit } from '../types';

const COLS = 'minmax(0,0.8fr) minmax(0,1.6fr) minmax(0,2.4fr) minmax(0,1.7fr)';

function SignalRow({ s }: { s: AbuseSignal }) {
  const can = useCan();
  const resolve = useResolveSignal();
  return (
    <TRow cols={COLS} min={700}>
      <div role="cell">
        <Badge tone={sevTone(s.severity)}>{s.severity}</Badge>
      </div>
      <div role="cell" className="min0">
        <div className="ellipsis t-strong">{s.tenantName}</div>
        <time className="t-xs faint" dateTime={s.detectedAt} title={formatDateTime(s.detectedAt)}>
          {timeAgo(s.detectedAt)}
        </time>
      </div>
      <div role="cell" style={{ color: 'var(--tx2)' }}>
        {s.signal}
      </div>
      <div role="cell" className="hstack wrap" style={{ justifyContent: 'flex-end' }}>
        {can('governance.manage') ? (
          <>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ id: s.id, how: 'action' }, { onSuccess: (r) => r && toast(r.outcome) })}
            >
              {resolve.isPending && resolve.variables.how === 'action' && <Spinner />} {s.actionLabel}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={resolve.isPending}
              aria-label={`Dismiss signal for ${s.tenantName}`}
              onClick={() =>
                resolve.mutate(
                  { id: s.id, how: 'dismiss' },
                  { onSuccess: () => toast(`Signal for ${s.tenantName} dismissed — no action taken`) },
                )
              }
            >
              Dismiss
            </button>
          </>
        ) : (
          <span className="t-xs faint">Suggested: {s.actionLabel}</span>
        )}
      </div>
    </TRow>
  );
}

function SignalsCard() {
  const q = useAbuseSignals();
  return (
    <Card title="Abuse signals" className="table-scroll">
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={24} />} compact>
        {(rows) =>
          rows.length ? (
            <div role="table" aria-label="Abuse signals">
              {rows.map((s) => (
                <SignalRow key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <Empty>All signals cleared. Nothing needs review.</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

const perMinute = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Enter a whole number.')
  .transform(Number)
  .refine((n) => n >= 1 && n <= 100_000, 'From 1 to 100,000.');
const limitsSchema = z.object({ Launch: perMinute, Growth: perMinute, Scale: perMinute });

function RateLimitForm({ limits }: { limits: RateLimit[] }) {
  const can = useCan();
  const save = useSetRateLimits();
  const [formError, setFormError] = useState<string | null>(null);
  const byPlan = Object.fromEntries(limits.map((l) => [l.plan, l])) as Record<Plan, RateLimit | undefined>;
  const values = Object.fromEntries(PLANS.map((p) => [p, String(byPlan[p]?.perMinute ?? '')])) as Record<Plan, string>;
  const form = useZodForm(limitsSchema, { defaultValues: values });
  const disabled = !can('governance.manage');
  const draft = form.watch();

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    save.mutate(
      PLANS.map((plan) => ({ plan, perMinute: v[plan] })),
      {
        onSuccess: () => toast(`Rate limits applied across all tenants — ${PLANS.map((p) => `${p} ${num(v[p])}`).join(' · ')} req/min`),
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <ul className="plain-list">
        {PLANS.map((plan) => {
          const l = byPlan[plan];
          const err = form.formState.errors[plan]?.message;
          const n = Number(draft[plan]);
          const belowPeak = !err && l && Number.isFinite(n) && n > 0 && n < l.peakPerMinute;
          const id = `rate-${plan}`;
          return (
            <li key={plan} className="row wrap" style={{ gap: '8px 12px', padding: '12px 0' }}>
              <label htmlFor={id} style={{ fontWeight: 700, width: 70, flexShrink: 0 }}>
                {plan}
              </label>
              <input
                id={id}
                className="input"
                inputMode="numeric"
                aria-label={`${plan} requests per minute`}
                aria-invalid={err ? true : undefined}
                aria-describedby={err || belowPeak ? `${id}-msg` : undefined}
                disabled={disabled}
                style={{ width: 90, flexShrink: 0, padding: '7px 10px', fontWeight: 700, textAlign: 'right' }}
                {...form.register(plan)}
              />
              <span className="t-sm muted min0">req/min</span>
              <span className="muted nowrap" style={{ fontSize: 12, marginLeft: 'auto' }}>
                peak {l ? num(l.peakPerMinute) : '—'}/min
                {l && l.perMinute !== l.defaultPerMinute ? ` · default ${num(l.defaultPerMinute)}` : ''}
              </span>
              {err ? (
                <div id={`${id}-msg`} className="field-error" role="alert" style={{ flexBasis: '100%', marginTop: 0 }}>
                  {err}
                </div>
              ) : belowPeak ? (
                <div id={`${id}-msg`} className="field-hint fg-warn" style={{ flexBasis: '100%', marginTop: 0 }}>
                  Below today’s peak — busy {plan} tenants will be throttled.
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <FormError>{formError}</FormError>
      {!disabled && (
        <button
          type="submit"
          className="btn btn--primary"
          style={{ marginTop: 14, padding: '9px 16px', fontSize: 13 }}
          disabled={save.isPending}
        >
          {save.isPending && <Spinner />} Apply limits
        </button>
      )}
    </form>
  );
}

const ipSchema = z.object({
  ip: z.string().trim().min(1, 'Enter an IP address or CIDR range.').refine(isIpOrCidr, IP_ERROR),
});

function BlockIpForm() {
  const block = useBlockIp();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(ipSchema, { defaultValues: { ip: '' }, mode: 'onSubmit' });
  const err = form.formState.errors.ip?.message;

  const onSubmit = form.handleSubmit(({ ip }) => {
    setFormError(null);
    block.mutate(
      { ip },
      {
        onSuccess: (row) => {
          form.reset({ ip: '' });
          toast(`${row.ip} blocked — requests from it now get a 403 at the edge`);
        },
        onError: (e) => {
          if (!applyServerErrors(form, e)) setFormError(errorMessage(e));
        },
      },
    );
  });

  return (
    <form style={{ margin: '12px 0' }} onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="hstack">
        <input
          className="input mono"
          style={{ flex: 1, minWidth: 0, padding: '9px 12px' }}
          placeholder="e.g. 203.0.113.42 or 198.51.100.0/24"
          aria-label="IP address or CIDR range to block"
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? 'block-ip-msg' : undefined}
          autoComplete="off"
          {...form.register('ip')}
        />
        <button type="submit" className="btn btn--primary" style={{ padding: '9px 14px' }} disabled={block.isPending}>
          {block.isPending && <Spinner />} Block
        </button>
      </div>
      {err && (
        <div id="block-ip-msg" className="field-error" role="alert">
          {err}
        </div>
      )}
      <FormError>{formError}</FormError>
    </form>
  );
}

function BlockedIpsCard() {
  const can = useCan();
  const q = useBlockedIps();
  const unblock = useUnblockIp();
  return (
    <Card title="Blocked IPs">
      {can('governance.manage') && <BlockIpForm />}
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={20} />} compact>
        {(rows) =>
          rows.length ? (
            <ul className="plain-list" aria-label="Blocked IP addresses">
              {rows.map((b) => (
                <li key={b.id} className="row wrap" style={{ padding: '10px 0', gap: '4px 12px' }}>
                  <span className="mono t-strong">{b.ip}</span>
                  <span className="t-sm muted" style={{ flex: 1, minWidth: 140 }} title={formatDateTime(b.blockedAt)}>
                    {b.reason} · {timeAgo(b.blockedAt)}
                    {b.blockedBy !== 'System' && ` · ${b.blockedBy}`}
                  </span>
                  {can('governance.manage') && (
                    <ConfirmButton
                      className="link"
                      style={{ fontSize: 12 }}
                      confirmLabel={`Confirm unblock ${b.ip}`}
                      disabled={unblock.isPending}
                      onConfirm={() => unblock.mutate(b.id, { onSuccess: () => toast(`${b.ip} unblocked — traffic allowed again`) })}
                    >
                      Unblock
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No IPs blocked.</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

export default function AbusePage() {
  const limits = useRateLimits();
  return (
    <Screen max={1150} label="Abuse and limits">
      <SignalsCard />

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}
      >
        <Card title="API rate limits">
          <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
            Requests per minute per tenant, by plan.
          </p>
          {limits.error ? (
            <ErrorState error={limits.error} onRetry={() => void limits.refetch()} compact />
          ) : limits.isPending ? (
            <SkeletonRows rows={3} h={28} />
          ) : (
            <RateLimitForm limits={limits.data} />
          )}
        </Card>

        <BlockedIpsCard />
      </div>
    </Screen>
  );
}
