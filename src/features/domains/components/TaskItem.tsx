import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { useT } from '../i18n';
import type { RegistrarTask, TaskDetail } from '../types';
import { TASK_TONE } from '../format';
import { TenantFilterButton } from './shared';
import { TaskActions } from './TaskActions';

/** Times are ISO-8601: requested_at with the time, expires_at as a date; other values as they are. */
const detailValue = (d: TaskDetail) =>
  d.key === 'requested_at' ? formatDateTime(d.value) : d.key === 'expires_at' ? formatDate(d.value) : d.value;

interface Props {
  task: RegistrarTask;
  /** Narrows the queue to the task's tenant (omitted inside a registration). */
  onTenant?: (id: string) => void;
  /** Hide the domain link (inside that domain's own drawer). */
  inRegistration?: boolean;
}

/** One registrar task: what to do in the registrar's dashboard, its context, and Complete / Cancel. */
export function TaskItem({ task, onTenant, inRegistration }: Props) {
  const t = useT();
  const settled = task.status !== 'open';
  return (
    <article
      className="card card--tight"
      aria-label={t('tasks.itemLabel', { kind: t(`taskKind.${task.kind}`), domain: task.domain })}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div className="hstack wrap" style={{ gap: 8 }}>
        <Badge tone="accent" pill xs>
          {t(`taskKind.${task.kind}`)}
        </Badge>
        <Badge tone={TASK_TONE[task.status]} pill xs>
          {t(`taskStatus.${task.status}`)}
        </Badge>
        {!inRegistration && (
          <Link to={`/domains/${task.registrationId}`} className="row-link" style={{ fontWeight: 700 }}>
            {task.domain}
          </Link>
        )}
        {!inRegistration && onTenant && (
          <span className="t-sm min0" style={{ maxWidth: 260 }}>
            <TenantFilterButton id={task.tenantId} name={task.tenantName} onFilter={onTenant} />
          </span>
        )}
        <div className="spacer" />
        <span className="faint nowrap" style={{ fontSize: 11.5 }}>
          {settled && task.completedAt
            ? t('tasks.settled', { status: t(`taskStatus.${task.status}`), name: task.completedBy ?? '—', time: timeAgo(task.completedAt) })
            : t('tasks.created', { time: timeAgo(task.createdAt) })}
        </span>
      </div>
      {!settled && (
        <div>
          <div className="eyebrow">{t('tasks.instructions')}</div>
          <p className="t-sm" style={{ margin: '2px 0 0', lineHeight: 1.5 }}>
            {task.instructions}
          </p>
        </div>
      )}
      {task.details.length > 0 && (
        <dl className="t-xs hstack wrap" style={{ gap: '4px 16px', margin: 0 }} aria-label={t('tasks.context')}>
          {task.details.map((d) => (
            <div key={d.key} className="hstack" style={{ gap: 4, alignItems: 'baseline' }}>
              <dt className="muted">{t(`taskDetail.${d.key}`)}</dt>
              <dd style={{ margin: 0, fontWeight: 600 }} className={d.key === 'order_id' ? 'mono' : undefined}>
                {detailValue(d)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {task.resolutionNote && (
        <p className="t-sm muted" style={{ margin: 0 }}>
          {t('tasks.resolution', { note: task.resolutionNote })}
        </p>
      )}
      <TaskActions task={task} />
    </article>
  );
}
