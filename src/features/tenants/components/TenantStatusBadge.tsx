import { Badge } from '@/components/ui';
import { statusTone } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useT } from '../i18n';
import { isPausedForCard } from '../status';
import type { Tenant } from '../types';

/** The tenant's status; a school paused for a missing card shows "Paused" instead of "Suspended". */
export function TenantStatusBadge({ t: tn, pill }: { t: Pick<Tenant, 'status' | 'suspensionReason'>; pill?: boolean }) {
  const t = useT();
  const tc = useCommonT();
  if (isPausedForCard(tn))
    return (
      <Badge pill={pill} tone="warn" title={t('status.pausedTitle')}>
        {t('status.paused')}
      </Badge>
    );
  return (
    <Badge pill={pill} tone={statusTone(tn.status)}>
      {tc(`enums.tenantStatus.${tn.status}`)}
    </Badge>
  );
}
