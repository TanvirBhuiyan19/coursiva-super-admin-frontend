import { Badge } from '@/components/ui';
import { useT } from '../i18n';
import { ORDER_TONE, REGISTRATION_TONE } from '../format';
import type { DomainOrderStatus, RegistrationStatus } from '../types';

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const t = useT();
  return (
    <Badge tone={REGISTRATION_TONE[status]} pill xs>
      {t(`registrationStatus.${status}`)}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: DomainOrderStatus }) {
  const t = useT();
  return (
    <Badge tone={ORDER_TONE[status]} pill xs>
      {t(`orderStatus.${status}`)}
    </Badge>
  );
}

/** "in 20 days" · "today" · "5 days ago". */
export function ExpiryDistance({ days }: { days: number | null }) {
  const t = useT();
  if (days == null) return null;
  const text =
    days > 0
      ? t('registrations.inDays', { count: days })
      : days === 0
        ? t('registrations.today')
        : t('registrations.daysAgo', { count: -days });
  return <span className={days <= 7 ? 'fg-bad' : days <= 30 ? 'fg-warn' : 'muted'}>{text}</span>;
}

/** Tenant name that narrows the current list to that tenant (the drawer links to the tenant itself). */
export function TenantFilterButton({ id, name, onFilter }: { id: string; name: string; onFilter: (id: string) => void }) {
  const t = useT();
  return (
    <button
      type="button"
      className="link link--muted ellipsis"
      style={{ maxWidth: '100%', textAlign: 'left' }}
      title={t('filterByTenant', { name })}
      onClick={(e) => {
        e.stopPropagation();
        onFilter(id);
      }}
    >
      {name}
    </button>
  );
}

/** The active tenant filter, removable. */
export function TenantFilterChip({ name, onClear }: { name: string; onClear: () => void }) {
  const t = useT();
  return (
    <span className="hstack" style={{ gap: 6 }}>
      <Badge tone="accent" pill>
        {t('tenantFilter', { name })}
      </Badge>
      <button type="button" className="link link--muted" style={{ fontSize: 12 }} onClick={onClear}>
        {t('clearTenant')}
      </button>
    </span>
  );
}
