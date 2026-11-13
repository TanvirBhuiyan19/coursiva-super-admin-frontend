import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Badge,
  Card,
  ConfirmButton,
  ConfirmDialog,
  Empty,
  ErrorState,
  FormError,
  Pagination,
  QueryState,
  Screen,
  SkeletonRows,
  Spinner,
  TRow,
} from '@/components/ui';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { PLANS, type Plan } from '@/lib/domain';
import { formatDateTime, num, sevTone, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { useDebounced } from '@/lib/useDebounced';
import { useSection } from '@/lib/useSection';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useAbuseSignals, useBlockIp, useBlockedIps, useRateLimits, useResolveSignal, useSetRateLimits, useUnblockIp } from '../api';
import { t as tStatic, useT } from '../i18n';
import { isIpOrCidr } from '../ip';
import type { AbuseSignal, RateLimit } from '../types';

const SECTIONS = ['signals', 'limits', 'blocked'] as const;

const COLS = 'minmax(0,0.8fr) minmax(0,1.6fr) minmax(0,2.4fr) minmax(0,1.7fr)';

function SignalRow({ s }: { s: AbuseSignal }) {
  const t = useT();
  const can = useCan();
  const resolve = useResolveSignal();
  // Freezing blocks the school's card revenue, so it names the impact and asks for the school's name typed back.
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const act = () =>
    resolve.mutate(
      { id: s.id, how: 'action' },
      {
        onSuccess: (r) => {
          setConfirmFreeze(false);
          if (r) toast(r.outcome);
        },
      },
    );
  return (
    <TRow cols={COLS} min={700}>
      <div role="cell">
        <Badge tone={sevTone(s.severity)}>{t(`enums.severity.${s.severity}`)}</Badge>
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
              onClick={() => (s.action === 'freeze_checkout' ? setConfirmFreeze(true) : act())}
            >
              {resolve.isPending && resolve.variables.how === 'action' && <Spinner />} {s.actionLabel}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={resolve.isPending}
              aria-label={t('abuse.dismissLabel', { tenant: s.tenantName })}
              onClick={() =>
                resolve.mutate({ id: s.id, how: 'dismiss' }, { onSuccess: () => toast(t('abuse.dismissed', { tenant: s.tenantName })) })
              }
            >
              {t('abuse.dismiss')}
            </button>
          </>
        ) : (
          <span className="t-xs faint">{t('abuse.suggested', { action: s.actionLabel })}</span>
        )}
      </div>
      {confirmFreeze && (
        <ConfirmDialog
          title={t('abuse.freeze.title', { tenant: s.tenantName })}
          phrase={s.tenantName}
          confirmLabel={t('abuse.freeze.action')}
          pending={resolve.isPending}
          onConfirm={act}
          onCancel={() => setConfirmFreeze(false)}
        >
          {t('abuse.freeze.body', { tenant: s.tenantName })}
        </ConfirmDialog>
      )}
    </TRow>
  );
}

function SignalsCard() {
  const t = useT();
  const [f, setF] = useUrlState({ signalsPage: '' });
  const q = useAbuseSignals(Number(f.signalsPage) || 1);
  return (
    <Card title={t('abuse.signals')} className="table-scroll">
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={24} />} compact>
        {(page) =>
          page.data.length ? (
            <>
              <div
                role="table"
                aria-label={t('abuse.signals')}
                aria-busy={q.isPlaceholderData}
                style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}
              >
                {page.data.map((s) => (
                  <SignalRow key={s.id} s={s} />
                ))}
              </div>
              {page.meta.lastPage > 1 && (
                <Pagination meta={page.meta} onPage={(p) => setF({ signalsPage: String(p) })} noun={t('abuse.signalsNoun')} />
              )}
            </>
          ) : (
            <Empty>{t('abuse.signalsEmpty')}</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

const perMinute = z
  .string()
  .trim()
  .regex(/^\d+$/, { error: () => tStatic('abuse.rateLimits.wholeNumber') })
  .transform(Number)
  .refine((n) => n >= 1 && n <= 100_000, { error: () => tStatic('abuse.rateLimits.range') });
const limitsSchema = z.object({ Launch: perMinute, Growth: perMinute, Scale: perMinute });

function RateLimitForm({ limits }: { limits: RateLimit[] }) {
  const t = useT();
  const tc = useCommonT();
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
        onSuccess: () =>
          toast(
            t('abuse.rateLimits.applied', {
              limits: PLANS.map((p) => t('abuse.rateLimits.appliedItem', { plan: tc(`enums.plan.${p}`), count: v[p] })).join(' · '),
            }),
          ),
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
          const belowPeak = !err && l?.peakPerMinute != null && Number.isFinite(n) && n > 0 && n < l.peakPerMinute;
          const id = `rate-${plan}`;
          return (
            <li key={plan} className="row wrap" style={{ gap: '8px 12px', padding: '12px 0' }}>
              <label htmlFor={id} style={{ fontWeight: 700, width: 70, flexShrink: 0 }}>
                {tc(`enums.plan.${plan}`)}
              </label>
              <input
                id={id}
                className="input"
                inputMode="numeric"
                aria-label={t('abuse.rateLimits.inputLabel', { plan: tc(`enums.plan.${plan}`) })}
                aria-invalid={err ? true : undefined}
                aria-describedby={err || belowPeak ? `${id}-msg` : undefined}
                disabled={disabled}
                style={{ width: 90, flexShrink: 0, padding: '7px 10px', fontWeight: 700, textAlign: 'right' }}
                {...form.register(plan)}
              />
              <span className="t-sm muted min0">{t('abuse.rateLimits.unit')}</span>
              <span className="muted nowrap" style={{ fontSize: 12, marginLeft: 'auto' }}>
                {/* null = request rates aren't sampled yet: a dash, never a fake 0. */}
                {t('abuse.rateLimits.peak', { peak: l?.peakPerMinute != null ? num(l.peakPerMinute) : '—' })}
                {l && l.perMinute !== l.defaultPerMinute ? t('abuse.rateLimits.default', { count: l.defaultPerMinute }) : ''}
              </span>
              {err ? (
                <div id={`${id}-msg`} className="field-error" role="alert" style={{ flexBasis: '100%', marginTop: 0 }}>
                  {err}
                </div>
              ) : belowPeak ? (
                <div id={`${id}-msg`} className="field-hint fg-warn" style={{ flexBasis: '100%', marginTop: 0 }}>
                  {t('abuse.rateLimits.belowPeak', { plan: tc(`enums.plan.${plan}`) })}
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
          {save.isPending && <Spinner />} {t('abuse.rateLimits.apply')}
        </button>
      )}
    </form>
  );
}

const ipSchema = z.object({
  ip: z
    .string()
    .trim()
    .min(1, { error: () => tStatic('abuse.blocked.required') })
    .refine(isIpOrCidr, { error: () => tStatic('abuse.blocked.invalid') }),
});

function BlockIpForm() {
  const t = useT();
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
          toast(t('abuse.blocked.blockedToast', { ip: row.ip }));
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
          placeholder={t('abuse.blocked.placeholder')}
          aria-label={t('abuse.blocked.inputLabel')}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? 'block-ip-msg' : undefined}
          autoComplete="off"
          {...form.register('ip')}
        />
        <button type="submit" className="btn btn--primary" style={{ padding: '9px 14px' }} disabled={block.isPending}>
          {block.isPending && <Spinner />} {t('abuse.blocked.block')}
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
  const t = useT();
  const can = useCan();
  const [f, setF] = useUrlState({ ipsQ: '', ipsPage: '' });
  const [search, setSearch] = useState(f.ipsQ);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.ipsQ) setF({ ipsQ: debounced, ipsPage: '' });
  }, [debounced, f.ipsQ, setF]);
  const q = useBlockedIps({ page: Number(f.ipsPage) || 1, search: f.ipsQ || undefined });
  const unblock = useUnblockIp();
  return (
    <Card title={t('abuse.blocked.title')}>
      {can('governance.manage') && <BlockIpForm />}
      <input
        className="input"
        type="search"
        style={{ width: 240, margin: '6px 0' }}
        placeholder={t('abuse.blocked.searchPlaceholder')}
        aria-label={t('abuse.blocked.searchLabel')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <QueryState query={q} skeleton={<SkeletonRows rows={3} h={20} />} compact>
        {(page) =>
          page.data.length ? (
            <>
              <ul
                className="plain-list"
                aria-label={t('abuse.blocked.list')}
                aria-busy={q.isPlaceholderData}
                style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}
              >
                {page.data.map((b) => (
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
                        confirmLabel={t('abuse.blocked.confirmUnblock', { ip: b.ip })}
                        disabled={unblock.isPending}
                        onConfirm={() => unblock.mutate(b.id, { onSuccess: () => toast(t('abuse.blocked.unblockedToast', { ip: b.ip })) })}
                      >
                        {t('abuse.blocked.unblock')}
                      </ConfirmButton>
                    )}
                  </li>
                ))}
              </ul>
              {page.meta.lastPage > 1 && (
                <Pagination meta={page.meta} onPage={(p) => setF({ ipsPage: String(p) })} noun={t('abuse.blocked.noun')} />
              )}
            </>
          ) : (
            <Empty>{f.ipsQ ? t('abuse.blocked.noMatch') : t('abuse.blocked.empty')}</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}

export default function AbusePage() {
  const t = useT();
  const limits = useRateLimits();
  const [section, setSection, sectionHref] = useSection(SECTIONS, 'signals');
  return (
    <Screen max={1150} label={t('abuse.title')}>
      <SectionedPage
        sections={SECTIONS.map((id) => ({ id, label: t(`sections.abuse.${id}`) }))}
        active={section}
        onChange={setSection}
        label={t('sections.abuse.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'signals'}>
          <SignalsCard />
        </SectionPanel>
        <SectionPanel active={section === 'limits'}>
          <Card title={t('abuse.rateLimits.title')}>
            <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
              {t('abuse.rateLimits.intro')}
            </p>
            {limits.error ? (
              <ErrorState error={limits.error} onRetry={() => void limits.refetch()} compact />
            ) : limits.isPending ? (
              <SkeletonRows rows={3} h={28} />
            ) : (
              <RateLimitForm limits={limits.data} />
            )}
          </Card>
        </SectionPanel>
        <SectionPanel active={section === 'blocked'}>
          <BlockedIpsCard />
        </SectionPanel>
      </SectionedPage>
    </Screen>
  );
}
