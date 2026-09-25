import { useParams } from 'react-router-dom';
import { Avatar, Badge, Drawer, ErrorState, Seg, Select, SkeletonRows } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { useCan } from '@/features/auth/useCan';
import { PLANS, REGIONS } from '@/lib/domain';
import { avatarColor, formatDay, formatMonth, initials, money, num, statusTone } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useTenant, useTenantAction, useUpdateTenant, useWatchTenant } from '../api';
import { useT } from '../i18n';
import type { TenantDetail } from '../types';
import {
  AccessSection,
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
        <Badge pill tone={statusTone(tn.status)}>
          {tc(`enums.tenantStatus.${tn.status}`)}
        </Badge>
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
        {tn.status === 'Trial' && <TrialExtend t={tn} />}
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
              <Badge xs tone={inv.status === 'Paid' ? 'good' : inv.status === 'Waived' ? 'flat' : 'bad'} style={{ fontSize: 11 }}>
                {t(`drawer.invoiceStatus.${inv.status}`)}
              </Badge>
            </div>
          ))}
        </Section>
      </Can>
      <FlagsSection t={tn} />
      <Section title={t('drawer.activity')}>
        {tn.timeline.map((e) => (
          <div key={e.text} className="row t-sm" style={{ gap: 10, padding: '7px 0', alignItems: 'baseline' }}>
            <span className="faint t-xs" style={{ width: 64, flexShrink: 0 }}>
              {formatDay(e.at)}
            </span>
            <span>{e.text}</span>
          </div>
        ))}
      </Section>
      <AccessSection t={tn} />
      <NotesSection t={tn} />
      <DangerZone t={tn} />
    </>
  );
}

function TrialExtend({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const action = useTenantAction(tn.id);
  if (!can('tenants.manage')) return null;
  return (
    <button
      type="button"
      className="btn btn--outline-accent btn--block"
      style={{ marginTop: 8, padding: 9 }}
      disabled={action.isPending}
      onClick={() => action.mutate('extend-trial', { onSuccess: () => toast(t('drawer.trialExtended', { name: tn.name })) })}
    >
      {t('drawer.extendTrial')}
    </button>
  );
}
