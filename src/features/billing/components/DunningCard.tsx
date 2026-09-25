import { Card, ConfirmButton, ErrorState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useDunning, usePauseDunning, useSettleInvoice } from '../api';
import type { DunningQueue, Invoice } from '../types';

const COLS = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1.7fr)';
const COLS_READONLY = 'minmax(0,2fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,1.1fr)';
const MIN = 760;

function policyText(q: DunningQueue | undefined) {
  if (!q) return undefined;
  const days = q.retryDays.length ? `Auto-retries day ${q.retryDays.join(', ')}` : 'No automatic retries';
  return `${days} · then ${q.autoSuspend ? 'suspension' : 'manual review'}`;
}

export function DunningCard() {
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
      { onSuccess: () => toast(`${money(v.amount)} collected from ${v.tenantName} — tenant back to active`) },
    );
  const waive = (v: Invoice) =>
    settle.mutate(
      { id: v.id, action: 'waive' },
      { onSuccess: () => toast(`Invoice waived for ${v.tenantName} — ${money(v.amount)} written off`) },
    );
  const togglePause = (v: Invoice) =>
    pause.mutate(
      { id: v.id, paused: !v.dunningPaused },
      {
        onSuccess: (next) =>
          toast(
            next.dunningPaused
              ? `Dunning paused for ${v.tenantName} — no automatic retries until you resume`
              : `Dunning resumed for ${v.tenantName}${next.nextRetryAt ? ` — next retry ${formatDate(next.nextRetryAt)}` : ''}`,
          ),
      },
    );

  return (
    <Card title="Dunning queue" sub={policyText(q)} className="table-scroll">
      {queue.isPending ? (
        <SkeletonRows rows={2} h={24} />
      ) : queue.error ? (
        <ErrorState compact error={queue.error} onRetry={() => void queue.refetch()} />
      ) : !queue.data.items.length ? (
        <div className="muted" style={{ padding: '14px 0', fontSize: 13 }}>
          No tenants in dunning — all charges healthy.
        </div>
      ) : (
        <div role="table" aria-label="Dunning queue">
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: cols, minWidth: MIN }}>
            <div role="columnheader">Tenant</div>
            <div role="columnheader">Invoice</div>
            <div role="columnheader">Attempts</div>
            <div role="columnheader">Next retry</div>
            {canManage && (
              <div role="columnheader" className="sr-only">
                Actions
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
                  {v.plan} · {money(v.amount)}
                </div>
                <div role="cell">
                  Attempt {v.attempts} of {queue.data.maxAttempts}
                </div>
                <div role="cell" style={{ fontWeight: 600, color: v.dunningPaused ? 'var(--aFg)' : 'var(--tx3)' }}>
                  {v.dunningPaused ? 'Paused' : v.nextRetryAt ? formatDateTime(v.nextRetryAt) : '—'}
                </div>
                {canManage && (
                  <div role="cell" className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--primary"
                      disabled={busy}
                      onClick={() => retry(v)}
                      aria-label={`Retry now for ${v.tenantName}`}
                    >
                      Retry now
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => togglePause(v)}
                      aria-label={`${v.dunningPaused ? 'Resume' : 'Pause'} dunning for ${v.tenantName}`}
                    >
                      {v.dunningPaused ? 'Resume' : 'Pause'}
                    </button>
                    <ConfirmButton
                      className="btn btn--sm btn--danger"
                      confirmLabel="Confirm waive"
                      disabled={busy}
                      onConfirm={() => waive(v)}
                    >
                      Waive
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
