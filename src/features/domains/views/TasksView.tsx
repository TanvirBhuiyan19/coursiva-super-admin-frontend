import { Chip, ChipGroup, Empty, ErrorState, Pagination, SkeletonRows } from '@/components/ui';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUrlState } from '@/lib/useUrlState';
import { useRegistrarTasks } from '../api';
import { TenantFilterChip } from '../components/shared';
import { TaskItem } from '../components/TaskItem';
import { useT } from '../i18n';
import { REGISTRAR_TASK_KINDS, TASK_STATUS_FILTERS, type RegistrarTaskKind, type TaskListParams, type TaskStatusFilter } from '../types';

const DEFAULTS = { status: 'open', kind: 'all', tenant: '', page: '1' };

export default function TasksView() {
  const t = useT();
  const tc = useCommonT();
  const [f, setF] = useUrlState(DEFAULTS);
  const status = (TASK_STATUS_FILTERS as readonly string[]).includes(f.status) ? (f.status as TaskStatusFilter) : 'open';
  const kind = (REGISTRAR_TASK_KINDS as readonly string[]).includes(f.kind) ? (f.kind as RegistrarTaskKind) : null;
  const params: TaskListParams = {
    page: Number(f.page) || 1,
    perPage: 25,
    status,
    ...(kind ? { kind } : {}),
    ...(f.tenant ? { tenantId: f.tenant } : {}),
  };
  const list = useRegistrarTasks(params);
  const rows = list.data?.data ?? [];
  const counts = list.data?.meta.counts;
  const openTotal = counts?.reduce((s, c) => s + c.count, 0);
  const tenantName = rows.find((r) => r.tenantId === f.tenant)?.tenantName ?? f.tenant;
  const filtered = status !== 'open' || !!kind || !!f.tenant;

  return (
    <>
      <div className="hstack wrap">
        <ChipGroup
          size="sm"
          label={t('tasks.statusLabel')}
          options={TASK_STATUS_FILTERS.map((s) => [s, t(`taskStatus.${s}`)] as const)}
          value={status}
          onChange={(v) => setF({ status: v })}
        />
        {f.tenant && <TenantFilterChip name={tenantName} onClear={() => setF({ tenant: '' })} />}
      </div>
      <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label={t('tasks.kindLabel')}>
        <Chip size="sm" on={!kind} onClick={() => setF({ kind: 'all' })}>
          {openTotal != null ? t('withCount', { label: t('all'), count: openTotal }) : t('all')}
        </Chip>
        {REGISTRAR_TASK_KINDS.map((k) => {
          const count = counts?.find((c) => c.kind === k)?.count;
          return (
            <Chip key={k} size="sm" on={kind === k} onClick={() => setF({ kind: k })}>
              {count != null ? t('withCount', { label: t(`taskKind.${k}`), count }) : t(`taskKind.${k}`)}
            </Chip>
          );
        })}
      </div>

      {list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <div className="card">
          <SkeletonRows rows={5} h={40} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <Empty
            action={
              filtered ? (
                <button type="button" className="btn btn--sm" onClick={() => setF({ status: 'open', kind: 'all', tenant: '' })}>
                  {tc('actions.clearFilters')}
                </button>
              ) : undefined
            }
          >
            {filtered ? t('tasks.emptyFiltered') : t('tasks.empty')}
          </Empty>
        </div>
      ) : (
        <section aria-label={t('tasks.tableLabel')} aria-busy={list.isFetching}>
          <ul className="plain-list stack" style={{ gap: 10 }}>
            {rows.map((task) => (
              <li key={task.id}>
                <TaskItem task={task} onTenant={(id) => setF({ tenant: id })} />
              </li>
            ))}
          </ul>
          <Pagination meta={list.data.meta} noun={t('tasks.noun')} onPage={(p) => setF({ page: String(p) })} />
        </section>
      )}
    </>
  );
}
