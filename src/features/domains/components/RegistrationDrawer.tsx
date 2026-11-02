import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Drawer, ErrorState, SkeletonRows } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useRegistration } from '../api';
import { useT } from '../i18n';
import type { RegistrationDetail } from '../types';
import { isFuture, usd } from '../format';
import { ExpiryDistance, OrderStatusBadge, RegistrationStatusBadge } from './shared';
import { TaskItem } from './TaskItem';

export function RegistrationDrawer({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const { registrationId } = useParams();
  const q = useRegistration(registrationId);
  return (
    <Drawer onClose={onClose} width={480} label={q.data ? t('detail.label', { domain: q.data.domain }) : t('detail.fallbackLabel')}>
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
        <Body key={q.data.id} r={q.data} onClose={onClose} />
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="drawer-section">{title}</h3>
      {children}
    </section>
  );
}

function Body({ r, onClose }: { r: RegistrationDetail; onClose: () => void }) {
  const t = useT();
  const none = t('detail.none');
  const onOff = (v: boolean | null) => (v == null ? t('autoRenew.unknown') : v ? t('autoRenew.on') : t('autoRenew.off'));
  const mismatch = r.providerAutoRenew != null && r.providerAutoRenew !== r.autoRenew;
  const facts: [string, ReactNode][] = [
    [t('detail.provider'), r.provider === 'fake' ? t('registrations.providerFake') : t('registrations.providerCloudflare')],
    [t('detail.providerRef'), r.providerRef ? <span className="mono">{r.providerRef}</span> : none],
    [t('detail.registered'), r.registeredAt ? formatDate(r.registeredAt) : none],
    [
      t('detail.expires'),
      r.expiresAt ? (
        <>
          {formatDate(r.expiresAt)} · <ExpiryDistance days={r.daysUntilExpiry} />
        </>
      ) : (
        none
      ),
    ],
    [t('detail.autoRenew'), onOff(r.autoRenew)],
    [t('detail.providerAutoRenew'), onOff(r.providerAutoRenew)],
    [t('detail.renewalPrice'), r.renewalPrice != null ? usd(r.renewalPrice) : none],
    [t('detail.renewalCost'), r.renewalCost != null ? usd(r.renewalCost) : none],
    [t('detail.privacy'), onOff(r.privacy)],
    [
      t('detail.transferLock'),
      r.transferLockedUntil && isFuture(r.transferLockedUntil)
        ? t('detail.transferLockUntil', { date: formatDate(r.transferLockedUntil) })
        : t('detail.transferLockNone'),
    ],
    [t('detail.lastReminder'), r.lastReminder ? t('detail.lastReminderValue', { count: r.lastReminder }) : none],
    [
      t('detail.site'),
      r.customDomain ? (
        <span className="hstack wrap" style={{ gap: 6 }}>
          <span className={r.customDomain.status === 'verified' ? 'fg-good' : r.customDomain.status === 'failed' ? 'fg-bad' : 'fg-warn'}>
            {t('detail.customDomain', { domain: r.customDomain.domain, status: t(`customDomainStatus.${r.customDomain.status}`) })}
          </span>
          {r.customDomain.isPrimary && (
            <Badge tone="accent" pill xs>
              {t('detail.primary')}
            </Badge>
          )}
        </span>
      ) : (
        <span className="muted">{t('detail.notConnected')}</span>
      ),
    ],
  ];

  return (
    <>
      <div className="hstack" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="min0" style={{ flex: 1 }}>
          <h2 className="display ellipsis" style={{ fontWeight: 700, fontSize: 17 }}>
            {r.domain}
          </h2>
          <Link to={`/tenants/${r.tenantId}`} className="link t-sm">
            {t('openTenant', { name: r.tenantName })}
          </Link>
        </div>
        <button type="button" className="close-x" onClick={onClose} aria-label={t('detail.close')}>
          ×
        </button>
      </div>
      <div className="hstack wrap" style={{ gap: 6, marginTop: 10 }}>
        <RegistrationStatusBadge status={r.status} />
        {r.openTasks > 0 && (
          <Badge tone="warn" pill xs>
            {t('registrations.openTasks', { count: r.openTasks })}
          </Badge>
        )}
      </div>

      {r.failureReason && (
        <div className="callout callout--bad" style={{ marginTop: 12 }}>
          <strong>{t('detail.failure')}</strong> {r.failureReason}
        </div>
      )}
      {r.contactPending && (
        <div className="callout callout--warn" style={{ marginTop: 12 }}>
          {t('detail.contactPending')}
        </div>
      )}
      {mismatch && (
        <div className="callout callout--warn" style={{ marginTop: 12 }}>
          {t('detail.mismatch', { school: onOff(r.autoRenew), registrar: onOff(r.providerAutoRenew) })}
        </div>
      )}

      <Section title={t('detail.facts')}>
        <dl className="plain-list" style={{ margin: 0 }}>
          {facts.map(([label, value]) => (
            <div key={label} className="row" style={{ padding: '7px 0' }}>
              <dt className="muted" style={{ flex: '0 0 44%' }}>
                {label}
              </dt>
              <dd className="min0" style={{ margin: 0, fontWeight: 600 }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={t('detail.registrant')}>
        {r.registrant ? (
          <>
            <p className="t-xs faint" style={{ margin: '0 0 6px' }}>
              {t('detail.registrantNote')}
            </p>
            <address className="t-sm" style={{ fontStyle: 'normal', lineHeight: 1.55 }}>
              <strong>{r.registrant.name}</strong>
              {r.registrant.organization && <div>{r.registrant.organization}</div>}
              <div>{r.registrant.email}</div>
              <div>{r.registrant.phone}</div>
              <div>{r.registrant.street}</div>
              <div>
                {[r.registrant.postalCode, r.registrant.city, r.registrant.state].filter(Boolean).join(' ')} · {r.registrant.country}
              </div>
            </address>
          </>
        ) : (
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('detail.registrantErased')}
          </p>
        )}
      </Section>

      <Section title={t('detail.tasks')}>
        {r.tasks.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {r.tasks.map((task) => (
              <TaskItem key={task.id} task={task} inRegistration />
            ))}
          </div>
        ) : (
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('detail.tasksEmpty')}
          </p>
        )}
      </Section>

      <Section title={t('detail.orders')}>
        {r.orders.length ? (
          <ul className="plain-list">
            {r.orders.map((o) => (
              <li key={o.id} className="row wrap" style={{ gap: 8, padding: '8px 0' }}>
                <span style={{ fontWeight: 600 }}>{t(`orderKind.${o.kind}`)}</span>
                <OrderStatusBadge status={o.status} />
                <span className="muted t-xs">{timeAgo(o.createdAt)}</span>
                <span className="spacer" />
                <span style={{ fontWeight: 700 }}>{usd(o.price)}</span>
                {o.invoiceNumber && <span className="mono t-xs muted">{o.invoiceNumber}</span>}
                {o.failureReason && (
                  <div className="t-xs fg-bad" style={{ flexBasis: '100%' }}>
                    {o.failureReason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('detail.ordersEmpty')}
          </p>
        )}
      </Section>
    </>
  );
}
