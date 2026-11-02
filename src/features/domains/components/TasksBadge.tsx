import { useCan } from '@/features/auth/useCan';
import { useOpenTaskCount } from '../api';
import { useT } from '../i18n';

/** Sidebar badge: open registrar tasks (`meta.counts` of `GET /domains/tasks` summed). */
export default function TasksBadge() {
  const t = useT();
  const can = useCan();
  const { data: count = 0 } = useOpenTaskCount({ enabled: can('tenants.view') });
  if (count <= 0) return null;
  return (
    <span className="sb-badge" aria-label={t('openTasksBadge', { count })}>
      {count}
    </span>
  );
}
