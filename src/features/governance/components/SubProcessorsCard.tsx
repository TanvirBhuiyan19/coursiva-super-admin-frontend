import { Badge, Card, Empty, QueryState, SkeletonRows } from '@/components/ui';
import { useSubProcessors } from '../api';
import { useT } from '../i18n';

/** The platform's sub-processors (one table, shown on Compliance and counted on Data residency). */
export function SubProcessorsCard() {
  const t = useT();
  const q = useSubProcessors();
  return (
    <Card title={t('subProcessors.title')}>
      <p className="t-sm muted" style={{ margin: '0 0 12px' }}>
        {t('subProcessors.intro')}
      </p>
      <QueryState query={q} skeleton={<SkeletonRows rows={6} h={20} />} compact>
        {(rows) =>
          rows.length ? (
            <ul className="stack plain-list">
              {rows.map((s) => (
                <li key={s.id} className="row wrap" style={{ gap: '6px 12px', padding: '10px 0' }}>
                  <span className="t-strong min0">{s.name}</span>
                  <Badge tone="flat">{s.location}</Badge>
                  <span className="muted t-sm" style={{ flex: 1, minWidth: 120 }}>
                    {s.purpose}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('subProcessors.empty')}</Empty>
          )
        }
      </QueryState>
    </Card>
  );
}
