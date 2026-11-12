import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Drawer, Empty, ErrorState, Input, Pagination, Seg, Select, SkeletonRows, Spinner } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { Can } from '@/features/auth/Can';
import { useCan } from '@/features/auth/useCan';
import { PLANS, REGIONS } from '@/lib/domain';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { avatarColor, formatDay, formatMonth, initials, money, num } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useExtendTrial, useTenant, useTenantActivity, useUpdateTenant, useWatchTenant } from '../api';
import { useT } from '../i18n';
import { canExtendTrial, EXTEND_TRIAL, isPausedForCard } from '../status';
import type { TenantDetail } from '../types';
import {
  AccessSection,
  CheckoutFreezeNotice,
  DangerZone,
  DomainSection,
  ExtensionsSection,
  FlagsSection,
  HealthCard,
  LimitsSection,
  ModulesSection,
  NotesSection,
  Section,
  UsageSection,
} from './TenantDrawerSections';
import { TenantStatusBadge } from './TenantStatusBadge';

const INVOICE_TONE = { Paid: 'good', 'Past due': 'bad', Waived: 'flat', Void: 'flat', Open: 'info' } as const;

export function TenantDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const { tenantId } = useParams();
  const q = useTenant(tenantId);
  return (
    <Drawer onClose={onClose} label={q.data?.name ?? t('drawer.fallbackLabel')}>
      {q.isPending ? (
        <SkeletonRows rows={10} h={20} />
      ) : q.error ? (
        <>
          <div className="hstack" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="close-x" onClick={onClose} aria-label={tc('actions.close')}>
              ×
            </button>
          </div>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        </>
      ) : (
        <TenantDrawerBody key={q.data.id} t={q.data} onClose={onClose} />
      )}
    </Drawer>
  );
}

function TenantDrawerBody({ t: tn, onClose }: { t: TenantDetail; onClose: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const update = useUpdateTenant(tn.id);
  const watch = useWatchTenant(tn.id);
  const manage = can('tenants.manage');

  return (
    <>
      <div className="hstack" style={{ gap: 13 }}>
        <Avatar text={initials(tn.name)} color={avatarColor(tn.id)} size={46} radius={11} />
        <div className="min0" style={{ flex: 1 }}>
          <h2 className="display" style={{ fontWeight: 700, fontSize: 17 }}>
            {tn.name}
          </h2>
          <div className="t-sm muted ellipsis">{tn.domain}</div>
        </div>
        <button type="button" className="close-x" onClick={onClose} aria-label={t('drawer.closeDetails')}>
          ×
        </button>
      </div>

      <div className="hstack wrap" style={{ marginTop: 14 }}>
        <TenantStatusBadge t={tn} pill />
        <Badge pill tone="flat" style={{ fontWeight: 600 }}>
          {t('drawer.owner', { name: tn.ownerName })}
        </Badge>
        <Badge pill tone="flat" style={{ fontWeight: 600 }}>
          {t('drawer.since', { date: formatMonth(tn.createdAt) })}
        </Badge>
        <button
          type="button"
          className={'badge badge--pill ' + (tn.watched ? 'tone-accent' : 'tone-flat')}
          style={{ border: 'none', cursor: 'pointer' }}
          aria-pressed={tn.watched}
          onClick={() =>
            watch.mutate(!tn.watched, {
              onSuccess: () =>
                toast(tn.watched ? t('drawer.stoppedWatching', { name: tn.name }) : t('drawer.nowWatching', { name: tn.name })),
            })
          }
        >
          {tn.watched ? t('drawer.watching') : t('drawer.watch')}
        </button>
      </div>

      <HealthCard t={tn} />
      <CheckoutFreezeNotice t={tn} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 16 }}>
        {[
          [t('drawer.stats.mrr'), tn.mrr ? money(tn.mrr) : '—'],
          [t('drawer.stats.students'), num(tn.students)],
          [t('drawer.stats.storage'), t('drawer.gb', { value: tn.storageUsedGb })],
        ].map(([label, value]) => (
          <div key={label} className="card card--inset">
            <div className="faint" style={{ fontSize: 11 }}>
              {label}
            </div>
            <div className="display" style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <Section title={t('drawer.plan')}>
        <Select
          className="select select--lg"
          style={{ fontWeight: 600 }}
          value={tn.plan}
          options={PLANS.map((p) => [p, tc(`enums.plan.${p}`)] as const)}
          label={t('drawer.plan')}
          disabled={!manage || update.isPending}
          onChange={(plan) =>
            update.mutate({ plan }, { onSuccess: () => toast(t('drawer.movedPlan', { name: tn.name, plan: tc(`enums.plan.${plan}`) })) })
          }
        />
        {tn.trial && (
          <div className="hstack wrap t-sm" style={{ gap: 8, marginTop: 8 }} role="status">
            <Badge xs tone={tn.trial.cardVerified ? 'good' : tn.trial.requiresCard ? 'warn' : 'flat'}>
              {tn.trial.cardVerified ? t('drawer.card.verified') : t('drawer.card.missing')}
            </Badge>
            {tn.trial.trialEndsAt && (
              <span className="muted">
                {t(tn.trial.paused ? 'drawer.card.trialEnded' : 'drawer.card.trialEnds', { date: formatDay(tn.trial.trialEndsAt) })}
              </span>
            )}
          </div>
        )}
        {isPausedForCard(tn) && (
          <div className="callout callout--warn t-sm" role="status" style={{ marginTop: 8 }}>
            {t('drawer.pausedForCard')}
          </div>
        )}
        {canExtendTrial(tn) && <TrialExtend t={tn} />}
      </Section>

      <Section title={t('drawer.residency')}>
        <Seg
          label={t('drawer.residencyLabel')}
          options={REGIONS.map((r) => [r, tc(`enums.region.${r}`)] as const)}
          value={tn.region}
          disabled={!manage || update.isPending}
          onChange={(region) =>
            update.mutate(
              { region },
              { onSuccess: () => toast(t('drawer.residencyChanged', { name: tn.name, region: tc(`enums.region.${region}`) })) },
            )
          }
        />
        {/* The data stays where it is until the platform team migrates it: say so instead of implying a move. */}
        {tn.regionRequest && (
          <p className="t-xs" role="status" style={{ margin: '8px 0 0' }}>
            <Badge tone="warn" xs>
              {t('drawer.residencyPendingBadge')}
            </Badge>{' '}
            {t('drawer.residencyPending', {
              region: tc(`enums.region.${tn.regionRequest.region}`),
              current: tc(`enums.region.${tn.region}`),
            })}
          </p>
        )}
      </Section>

      <DomainSection t={tn} />
      <UsageSection t={tn} />
      <LimitsSection t={tn} />
      <Can permission="billing.view">
        <ExtensionsSection t={tn} />
      </Can>
      <ModulesSection t={tn} />
      <Can permission="billing.view">
        <Section title={t('drawer.billingHistory')}>
          {tn.invoices.map((inv) => (
            <div key={inv.id} className="row t-sm" style={{ gap: 10, padding: '8px 0' }}>
              <span className="faint t-xs" style={{ width: 64, flexShrink: 0 }}>
                {formatDay(inv.issuedAt)}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{money(inv.amount)}</span>
              <Badge xs tone={INVOICE_TONE[inv.status]} style={{ fontSize: 11 }}>
                {t(`drawer.invoiceStatus.${inv.status}`)}
              </Badge>
            </div>
          ))}
          {/* The detail carries the newest 12; the revenue screen pages the school's whole history. */}
          {tn.invoices.length > 0 && (
            <div style={{ paddingTop: 6 }}>
              <Link className="link t-sm" to={`${pathOf('revenue')}?tenant=${encodeURIComponent(tn.id)}`}>
                {t('drawer.viewAllInvoices')}
              </Link>
            </div>
          )}
        </Section>
      </Can>
      <FlagsSection t={tn} />
      <ActivitySection key={tn.id} tenantId={tn.id} />
      <AccessSection t={tn} />
      <NotesSection t={tn} />
      <DangerZone t={tn} />
    </>
  );
}

/** The school's whole history, 10 entries a page (the detail's own `timeline` stops at the newest 20). */
function ActivitySection({ tenantId }: { tenantId: string }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const q = useTenantActivity(tenantId, page);
  return (
    <Section title={t('drawer.activity')}>
      {q.isPending ? (
        <SkeletonRows rows={4} h={18} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <Empty>{t('drawer.activityEmpty')}</Empty>
      ) : (
        <>
          <ol className="plain-list" aria-busy={q.isPlaceholderData} style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            {q.data.data.map((e, i) => (
              <li key={`${e.at}-${String(i)}`} className="row t-sm" style={{ gap: 10, padding: '7px 0', alignItems: 'baseline' }}>
                <span className="faint t-xs" style={{ width: 64, flexShrink: 0 }}>
                  {formatDay(e.at)}
                </span>
                <span>{e.text}</span>
              </li>
            ))}
          </ol>
          {q.data.meta.lastPage > 1 && <Pagination meta={q.data.meta} onPage={setPage} noun={t('drawer.activityNoun')} />}
        </>
      )}
    </Section>
  );
}

/** Extend a running trial by 1–90 days, or give a school paused for a missing card a new trial (which reopens it). */
function TrialExtend({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const id = useId();
  const extend = useExtendTrial(tn.id);
  const paused = isPausedForCard(tn);
  // When the form was opened: "now" for the end-date preview of a paused school's new trial.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const [days, setDays] = useState(String(EXTEND_TRIAL.default));
  const [error, setError] = useState<string | null>(null);
  if (!can('tenants.manage')) return null;

  if (openedAt === null)
    return (
      <button
        type="button"
        className="btn btn--outline-accent btn--block"
        style={{ marginTop: 8, padding: 9 }}
        onClick={() => setOpenedAt(Date.now())}
      >
        {paused ? t('drawer.trial.reopen') : t('drawer.trial.extend')}
      </button>
    );

  const n = Number(days);
  const valid = /^\d+$/.test(days.trim()) && n >= EXTEND_TRIAL.min && n <= EXTEND_TRIAL.max;
  // Preview only: the server decides the new end (a paused school starts a fresh trial from now).
  const base = !paused && tn.trialEndsAt ? new Date(tn.trialEndsAt).getTime() : openedAt;
  const submit = () => {
    if (!valid) {
      setError(t('drawer.trial.range'));
      return;
    }
    setError(null);
    extend.mutate(n, {
      onSuccess: (next) => {
        setOpenedAt(null);
        setDays(String(EXTEND_TRIAL.default));
        toast(
          paused
            ? t('drawer.trial.reopened', { name: tn.name, date: next.trialEndsAt ? formatDay(next.trialEndsAt) : '—' })
            : t('drawer.trial.extended', { name: tn.name, count: n }),
        );
      },
      onError: (err) => setError(err instanceof ApiError ? (err.field('days') ?? err.field('trial') ?? err.message) : errorMessage(err)),
    });
  };

  return (
    <form
      className="card card--inset stack"
      style={{ gap: 8, marginTop: 8 }}
      aria-label={paused ? t('drawer.trial.reopen') : t('drawer.trial.extend')}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field-label" htmlFor={id} style={{ margin: 0 }}>
        {paused ? t('drawer.trial.newLength') : t('drawer.trial.days')}
      </label>
      <div className="hstack" style={{ gap: 8 }}>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={EXTEND_TRIAL.min}
          max={EXTEND_TRIAL.max}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-msg`}
          style={{ width: 90 }}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user's click on "Extend trial"
          autoFocus
        />
        <span className="t-sm muted">{t('drawer.trial.unit')}</span>
      </div>
      {error ? (
        <div id={`${id}-msg`} className="field-error" role="alert">
          {error}
        </div>
      ) : (
        <div id={`${id}-msg`} className="field-hint">
          {valid ? t('drawer.trial.preview', { date: formatDay(new Date(base + n * 86_400_000).toISOString()) }) : t('drawer.trial.hint')}
        </div>
      )}
      <div className="hstack wrap" style={{ gap: 8 }}>
        <button type="submit" className="btn btn--primary" disabled={extend.isPending}>
          {extend.isPending && <Spinner />} {paused ? t('drawer.trial.confirmReopen') : t('drawer.trial.confirm')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={extend.isPending}
          onClick={() => {
            setOpenedAt(null);
            setError(null);
          }}
        >
          {tc('actions.cancel')}
        </button>
      </div>
    </form>
  );
}
