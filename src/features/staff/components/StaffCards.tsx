import { Link } from 'react-router-dom';
import { Badge, Card, Empty, QueryState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useStaffAction, useStaffActivity } from '../api';
import { useT } from '../i18n';
import type { StaffMember } from '../types';

/** Quarterly access review (SOC 2 expects every account re-confirmed every 90 days). */
export function AccessReviewCard({ members }: { members: StaffMember[] }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const action = useStaffAction();
  const rows = members
    .filter((m) => m.status !== 'Invited')
    .sort((a, b) => Number(b.reviewDue) - Number(a.reviewDue) || (a.lastReviewedAt ?? '').localeCompare(b.lastReviewedAt ?? ''));

  return (
    <Card title={t('accessReview.title')}>
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 4 }}>
        {t('accessReview.intro')}
      </p>
      {rows.length === 0 ? (
        <Empty>{t('accessReview.empty')}</Empty>
      ) : (
        <ul className="plain-list">
          {rows.map((m) => (
            <li key={m.id} className="row wrap" style={{ gap: 10, fontSize: 12.5 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 600 }}>
                  {m.name} · {t(`roles.${m.role}`)}
                </div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {m.lastReviewedAt ? t('accessReview.lastReviewed', { ago: timeAgo(m.lastReviewedAt) }) : t('accessReview.neverReviewed')}
                </div>
              </div>
              <Badge tone={m.reviewDue ? 'warn' : 'good'}>{m.reviewDue ? t('accessReview.reviewDue') : t('accessReview.current')}</Badge>
              {can('staff.manage') && !m.isSelf && (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 12 }}
                  disabled={action.isPending}
                  aria-label={t('accessReview.confirmFor', { name: m.name })}
                  onClick={() =>
                    action.mutate({ id: m.id, action: 'review' }, { onSuccess: () => toast(t('toasts.accessConfirmed', { name: m.name })) })
                  }
                >
                  {tc('actions.confirm')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function StaffActivityCard() {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const q = useStaffActivity();
  return (
    <Card
      title={t('activity.title')}
      right={
        can('audit.view') ? (
          <Link className="link" style={{ fontSize: 12 }} to="/audit">
            {t('activity.fullLog')}
          </Link>
        ) : undefined
      }
    >
      <QueryState query={q} compact skeleton={<SkeletonRows rows={5} />}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>{t('activity.empty')}</Empty>
          ) : (
            <ol className="plain-list">
              {rows.map((a) => (
                <li key={a.id} className="row row--top" style={{ gap: 10, fontSize: 12.5 }}>
                  <div className="min0" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.action}</div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {a.actorName} · {tc(`enums.auditCategory.${a.category}`)}
                    </div>
                  </div>
                  <time className="faint nowrap" dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                    {timeAgo(a.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Card>
  );
}
