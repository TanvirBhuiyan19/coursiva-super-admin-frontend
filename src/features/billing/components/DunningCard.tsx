import { Card, ConfirmButton, ErrorState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useDunning, usePauseDunning, useSettleInvoice } from '../api';
import { t as tBilling, useT } from '../i18n';
import type { DunningQueue, Invoice } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.7fr)';
const COLS_READONLY = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,1.1fr)';
const MIN = 760;

function policyText(q: DunningQueue | undefined) {
  if (!q) return undefined;
  const retries = q.retryDays.length ? tBilling('dunning.retryDays', { days: q.retryDays.join(', ') }) : tBilling('dunning.noRetries');
  return tBilling(q.autoSuspend ? 'dunning.thenSuspension' : 'dunning.thenReview', { retries });
}

export function DunningCard() {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const canManage = can('billing.manage');
  const queue = useDunning();
  const settle = useSettleInvoice();
  const pause = usePauseDunning();
  const q = queue.data;
  const cols = canManage ? COLS : COLS_READONLY;

  const retry = (v: Invoice) =>
    settle.mutate(
      { id: v.id, action: 'retry' },
      { onSuccess: () => toast(t('dunning.toasts.collected', { amount: money(v.amount), tenant: v.tenantName })) },
    );
  const waive = (v: Invoice) =>
    settle.mutate(
      { id: v.id, action: 'waive' },
      { onSuccess: () => toast(t('dunning.toasts.waived', { tenant: v.tenantName, amount: money(v.amount) })) },
    );
  const togglePause = (v: Invoice) =>
    pause.mutate(
      { id: v.id, paused: !v.dunningPaused },
      {
        onSuccess: (next) =>
          toast(
            next.dunningPaused
              ? t('dunning.toasts.paused', { tenant: v.tenantName })
              : next.nextRetryAt
                ? t('dunning.toasts.resumedNextRetry', { tenant: v.tenantName, date: formatDate(next.nextRetryAt) })
                : t('dunning.toasts.resumed', { tenant: v.tenantName }),
          ),
      },
    );

  return (
    <Card title={t('dunning.title')} sub={policyText(q)} className="table-scroll">
      {queue.isPending ? (
        <SkeletonRows rows={2} h={24} />
      ) : queue.error ? (
        <ErrorState compact error={queue.error} onRetry={() => void queue.refetch()} />
      ) : !queue.data.items.length ? (
        <div className="muted" style={{ padding: '14px 0', fontSize: 13 }}>
          {t('dunning.empty')}
        </div>
      ) : (
        <div role="table" aria-label={t('dunning.title')}>
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: cols, minWidth: MIN }}>
            <div role="columnheader">{t('columns.tenant')}</div>
            <div role="columnheader">{t('columns.invoice')}</div>
            <div role="columnheader">{t('columns.attempts')}</div>
            <div role="columnheader">{t('columns.nextRetry')}</div>
            {canManage && (
              <div role="columnheader" className="sr-only">
                {t('columns.actions')}
              </div>
            )}
          </div>
          {queue.data.items.map((v) => {
            const busy = settle.isPending && settle.variables.id === v.id;
            return (
              <div key={v.id} role="row" className="trow" style={{ gridTemplateColumns: cols, minWidth: MIN }}>
                <div role="cell" className="ellipsis" style={{ fontWeight: 600 }}>
                  {v.tenantName}
                </div>
                <div role="cell" className="muted">
                  {tc(`enums.plan.${v.plan}`)} · {money(v.amount)}
                </div>
                <div role="cell">{t('dunning.attempt', { attempt: v.attempts, max: queue.data.maxAttempts })}</div>
                <div role="cell" style={{ fontWeight: 600, color: v.dunningPaused ? 'var(--aFg)' : 'var(--tx3)' }}>
                  {v.dunningPaused ? t('dunning.paused') : v.nextRetryAt ? formatDateTime(v.nextRetryAt) : '—'}
                </div>
                {canManage && (
                  <div role="cell" className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      disabled={busy}
                      onClick={() => retry(v)}
                      aria-label={t('dunning.retryNowFor', { tenant: v.tenantName })}
                    >
                      {t('dunning.retryNow')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => togglePause(v)}
                      aria-label={t(v.dunningPaused ? 'dunning.resumeFor' : 'dunning.pauseFor', { tenant: v.tenantName })}
                    >
                      {v.dunningPaused ? t('dunning.resume') : t('dunning.pause')}
                    </button>
                    <ConfirmButton
                      className="btn btn--sm btn--danger"
                      confirmLabel={t('dunning.confirmWaive')}
                      disabled={busy}
                      onConfirm={() => waive(v)}
                    >
                      {t('dunning.waive')}
                    </ConfirmButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
