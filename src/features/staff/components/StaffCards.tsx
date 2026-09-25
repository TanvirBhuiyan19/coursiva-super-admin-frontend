import { Link } from 'react-router-dom';
import { Badge, Card, Empty, QueryState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDateTime, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useStaffAction, useStaffActivity } from '../api';
import type { StaffMember } from '../types';

/** Quarterly access review (SOC 2 expects every account re-confirmed every 90 days). */
export function AccessReviewCard({ members }: { members: StaffMember[] }) {
  const can = useCan();
  const action = useStaffAction();
  const rows = members
    .filter((m) => m.status !== 'Invited')
    .sort((a, b) => Number(b.reviewDue) - Number(a.reviewDue) || (a.lastReviewedAt ?? '').localeCompare(b.lastReviewedAt ?? ''));

  return (
    <Card title="Quarterly access review">
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 4 }}>
        SOC 2 expects every staff account to be re-confirmed every 90 days.
      </p>
      {rows.length === 0 ? (
        <Empty>No accounts to review.</Empty>
      ) : (
        <ul className="plain-list">
          {rows.map((m) => (
            <li key={m.id} className="row wrap" style={{ gap: 10, fontSize: 12.5 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 600 }}>
                  {m.name} · {m.role}
                </div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {m.lastReviewedAt ? `Last reviewed ${timeAgo(m.lastReviewedAt)}` : 'Never reviewed'}
                </div>
              </div>
              <Badge tone={m.reviewDue ? 'warn' : 'good'}>{m.reviewDue ? 'Review due' : 'Current'}</Badge>
              {can('staff.manage') && !m.isSelf && (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 12 }}
                  disabled={action.isPending}
                  aria-label={`Confirm ${m.name}’s access`}
                  onClick={() =>
                    action.mutate(
                      { id: m.id, action: 'review' },
                      { onSuccess: () => toast(`${m.name}’s access confirmed — next review in 90 days`) },
                    )
                  }
                >
                  Confirm
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
  const can = useCan();
  const q = useStaffActivity();
  return (
    <Card
      title="Recent staff activity"
      right={
        can('audit.view') ? (
          <Link className="link" style={{ fontSize: 12 }} to="/audit">
            Full log →
          </Link>
        ) : undefined
      }
    >
      <QueryState query={q} compact skeleton={<SkeletonRows rows={5} />}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>No staff activity yet.</Empty>
          ) : (
            <ol className="plain-list">
              {rows.map((a) => (
                <li key={a.id} className="row row--top" style={{ gap: 10, fontSize: 12.5 }}>
                  <div className="min0" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.action}</div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {a.actorName} · {a.category}
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
