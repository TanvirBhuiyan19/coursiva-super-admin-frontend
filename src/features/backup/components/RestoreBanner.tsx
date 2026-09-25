import { Bar, ConfirmButton } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useSession } from '@/features/auth/api';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRestoreAction } from '../api';
import type { Restore } from '../types';

const kindLabel = (r: Restore) => (r.dryRun ? 'Dry run' : 'Live restore');

/** Shows the restore that is staged, approved or running, with the second-person approval step. */
export function RestoreBanner({ restore: r }: { restore: Restore }) {
  const can = useCan();
  const { data: me } = useSession();
  const action = useRestoreAction();
  const line = `${r.dryRun ? 'DRY RUN' : 'LIVE RESTORE'} · ${r.scopeLabel} ← ${r.sourceLabel}`;

  if (r.status === 'staged') {
    const mine = r.stagedById === me?.id;
    return (
      <div className="callout callout--warn wrap" role="status" aria-label="Staged restore" style={{ alignItems: 'center', gap: 12 }}>
        <div className="min0" style={{ flex: 1, minWidth: 240 }}>
          <div className="fg-warn" style={{ fontWeight: 700 }}>
            <span aria-hidden="true">⏳ </span>
            {line}
          </div>
          <div className="t-xs muted" style={{ marginTop: 3 }}>
            Staged by {mine ? 'you' : r.stagedByName} {timeAgo(r.stagedAt)} ·{' '}
            {mine
              ? 'waiting for a second staff member — you can’t approve a restore you staged.'
              : r.canApprove
                ? 'needs your approval as the second staff member.'
                : 'waiting for a second staff member with platform access.'}
          </div>
        </div>
        {r.canApprove && (
          <ConfirmButton
            className="btn btn--primary"
            pending={action.isPending}
            confirmLabel={r.dryRun ? 'Confirm dry run' : 'Confirm live restore'}
            onConfirm={() =>
              action.mutate(
                { id: r.id, action: 'approve' },
                {
                  onSuccess: () =>
                    toast(
                      r.dryRun
                        ? `Dry run approved — ${r.scopeLabel} restores into an isolated sandbox, production untouched`
                        : `Restore approved — ${r.scopeLabel} goes into maintenance mode while it runs (ETA ${r.etaMinutes} min)`,
                    ),
                },
              )
            }
          >
            Approve as second staff
          </ConfirmButton>
        )}
        {can('platform.manage') && (
          <button
            type="button"
            className="btn"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ id: r.id, action: 'cancel' }, { onSuccess: () => toast(`Staged restore of ${r.scopeLabel} cancelled`) })
            }
          >
            Cancel restore
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="callout callout--accent wrap" role="status" aria-label="Restore in progress" style={{ alignItems: 'center', gap: 12 }}>
      <div className="min0" style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 700 }}>
          <span aria-hidden="true">● </span>
          {r.status === 'approved' ? `${kindLabel(r)} approved — starting` : `${kindLabel(r)} running`} · {r.scopeLabel} ← {r.sourceLabel}
        </div>
        <div className="t-xs muted" style={{ marginTop: 3 }}>
          {r.pointInTime ? 'Replaying the transaction log on top of the nearest snapshot. ' : ''}
          {r.dryRun
            ? 'Verifying into an isolated sandbox — production untouched. Report emails to platform staff.'
            : `Affected tenants are in maintenance mode.`}{' '}
          Staged by {r.stagedByName} · approved by {r.approvedByName ?? '—'} · ETA {r.etaMinutes} min
        </div>
      </div>
      <div style={{ width: 180 }}>
        <Bar value={Math.max(2, r.progress)} label={`Restore ${r.progress}% complete`} />
        <div className="t-xs muted" style={{ marginTop: 4, textAlign: 'right' }}>
          {r.progress}%
        </div>
      </div>
    </div>
  );
}
