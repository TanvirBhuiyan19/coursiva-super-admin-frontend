import { useParams } from 'react-router-dom';
import { Avatar, Badge, Drawer, ErrorState, Seg, Select, SkeletonRows } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { useCan } from '@/features/auth/useCan';
import { PLANS, REGIONS } from '@/lib/domain';
import { avatarColor, formatMonth, initials, money, num, statusTone } from '@/lib/format';
import { toast } from '@/store/ui';
import { useTenant, useTenantAction, useUpdateTenant, useWatchTenant } from '../api';
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
  const { tenantId } = useParams();
  const q = useTenant(tenantId);
  return (
    <Drawer onClose={onClose} label={q.data?.name ?? 'Tenant'}>
      {q.isPending ? (
        <SkeletonRows rows={10} h={20} />
      ) : q.error ? (
        <>
          <div className="hstack" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="close-x" onClick={onClose} aria-label="Close">
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

function TenantDrawerBody({ t, onClose }: { t: TenantDetail; onClose: () => void }) {
  const can = useCan();
  const update = useUpdateTenant(t.id);
  const watch = useWatchTenant(t.id);
  const manage = can('tenants.manage');

  return (
    <>
      <div className="hstack" style={{ gap: 13 }}>
        <Avatar text={initials(t.name)} color={avatarColor(t.id)} size={46} radius={11} />
        <div className="min0" style={{ flex: 1 }}>
          <h2 className="display" style={{ fontWeight: 700, fontSize: 17 }}>
            {t.name}
          </h2>
          <div className="t-sm muted ellipsis">{t.domain}</div>
        </div>
        <button type="button" className="close-x" onClick={onClose} aria-label="Close tenant details">
          ×
        </button>
      </div>

      <div className="hstack wrap" style={{ marginTop: 14 }}>
        <Badge pill tone={statusTone(t.status)}>
          {t.status}
        </Badge>
        <Badge pill tone="flat" style={{ fontWeight: 600 }}>
          Owner: {t.ownerName}
        </Badge>
        <Badge pill tone="flat" style={{ fontWeight: 600 }}>
          Since {formatMonth(t.createdAt)}
        </Badge>
        <button
          type="button"
          className={'badge badge--pill ' + (t.watched ? 'tone-accent' : 'tone-flat')}
          style={{ border: 'none', cursor: 'pointer' }}
          aria-pressed={t.watched}
          onClick={() =>
            watch.mutate(!t.watched, {
              onSuccess: () =>
                toast(t.watched ? `Stopped watching ${t.name}` : `Watching ${t.name} — alerts on payment failures & usage spikes`),
            })
          }
        >
          {t.watched ? '★ Watching' : '☆ Watch tenant'}
        </button>
      </div>

      <HealthCard t={t} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 16 }}>
        {[
          ['MRR', t.mrr ? money(t.mrr) : '—'],
          ['Students', num(t.students)],
          ['Storage', `${t.storageUsedGb} GB`],
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

      <Section title="Plan">
        <Select
          className="select select--lg"
          style={{ fontWeight: 600 }}
          value={t.plan}
          options={PLANS}
          label="Plan"
          disabled={!manage || update.isPending}
          onChange={(plan) => update.mutate({ plan }, { onSuccess: () => toast(`${t.name} moved to ${plan}`) })}
        />
        {t.status === 'Trial' && <TrialExtend t={t} />}
      </Section>

      <Section title="Data residency">
        <Seg
          label="Data residency region"
          options={REGIONS}
          value={t.region}
          disabled={!manage || update.isPending}
          onChange={(region) =>
            update.mutate(
              { region },
              { onSuccess: () => toast(`${t.name} data residency → ${region} — read-only for ~20 minutes during cutover`) },
            )
          }
        />
      </Section>

      <DomainSection t={t} />
      <UsageSection t={t} />
      <LimitsSection t={t} />
      <Can permission="billing.view">
        <ExtensionsSection t={t} />
      </Can>
      <ModulesSection t={t} />
      <Can permission="billing.view">
        <Section title="Billing history">
          {t.invoices.map((inv) => (
            <div key={inv.id} className="row t-sm" style={{ gap: 10, padding: '8px 0' }}>
              <span className="faint t-xs" style={{ width: 64, flexShrink: 0 }}>
                {new Date(inv.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{money(inv.amount)}</span>
              <Badge xs tone={inv.status === 'Paid' ? 'good' : inv.status === 'Waived' ? 'flat' : 'bad'} style={{ fontSize: 11 }}>
                {inv.status === 'Past due' ? 'Failed' : inv.status}
              </Badge>
            </div>
          ))}
        </Section>
      </Can>
      <FlagsSection t={t} />
      <Section title="Activity">
        {t.timeline.map((e) => (
          <div key={e.text} className="row t-sm" style={{ gap: 10, padding: '7px 0', alignItems: 'baseline' }}>
            <span className="faint t-xs" style={{ width: 64, flexShrink: 0 }}>
              {new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span>{e.text}</span>
          </div>
        ))}
      </Section>
      <AccessSection t={t} />
      <NotesSection t={t} />
      <DangerZone t={t} />
    </>
  );
}

function TrialExtend({ t }: { t: TenantDetail }) {
  const can = useCan();
  const action = useTenantAction(t.id);
  if (!can('tenants.manage')) return null;
  return (
    <button
      type="button"
      className="btn btn--outline-accent btn--block"
      style={{ marginTop: 8, padding: 9 }}
      disabled={action.isPending}
      onClick={() => action.mutate('extend-trial', { onSuccess: () => toast(`Trial extended 14 days for ${t.name}`) })}
    >
      Extend trial +14 days
    </button>
  );
}
