import { Bar, ConfirmButton } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useSession } from '@/features/auth/api';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRestoreAction } from '../api';
import { t as tStatic, useT } from '../i18n';
import type { Restore } from '../types';

// Decorative glyphs (aria-hidden), not translatable text.
const HOURGLASS = '⏳ ';
const DOT = '● ';
const kindLabel = (r: Restore) => (r.dryRun ? tStatic('banner.dryRun') : tStatic('banner.live'));

/** Shows the restore that is staged, approved or running, with the second-person approval step. */
export function RestoreBanner({ restore: r }: { restore: Restore }) {
  const t = useT();
  const can = useCan();
  const { data: me } = useSession();
  const action = useRestoreAction();
  const line = t('banner.line', {
    kind: r.dryRun ? t('banner.dryRunCaps') : t('banner.liveCaps'),
    scope: r.scopeLabel,
    source: r.sourceLabel,
  });

  if (r.status === 'staged') {
    const mine = r.stagedById === me?.id;
    return (
      <div
        className="callout callout--warn wrap"
        role="status"
        aria-label={t('banner.stagedLabel')}
        style={{ alignItems: 'center', gap: 12 }}
      >
        <div className="min0" style={{ flex: 1, minWidth: 240 }}>
          <div className="fg-warn" style={{ fontWeight: 700 }}>
            <span aria-hidden="true">{HOURGLASS}</span>
            {line}
          </div>
          <div className="t-xs muted" style={{ marginTop: 3 }}>
            {mine
              ? t('banner.stagedByYou', { when: timeAgo(r.stagedAt) })
              : t('banner.stagedBy', { name: r.stagedByName, when: timeAgo(r.stagedAt) })}{' '}
            {mine ? t('banner.waitingMine') : r.canApprove ? t('banner.needsApproval') : t('banner.waitingOther')}
          </div>
        </div>
        {r.canApprove && (
          <ConfirmButton
            className="btn btn--primary"
            pending={action.isPending}
            confirmLabel={r.dryRun ? t('banner.confirmDryRun') : t('banner.confirmLive')}
            onConfirm={() =>
              action.mutate(
                { id: r.id, action: 'approve' },
                {
                  onSuccess: () =>
                    toast(
                      r.dryRun
                        ? t('banner.dryRunApproved', { scope: r.scopeLabel })
                        : t('banner.liveApproved', { scope: r.scopeLabel, eta: r.etaMinutes }),
                    ),
                },
              )
            }
          >
            {t('banner.approve')}
          </ConfirmButton>
        )}
        {can('platform.manage') && (
          <button
            type="button"
            className="btn"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ id: r.id, action: 'cancel' }, { onSuccess: () => toast(t('banner.cancelled', { scope: r.scopeLabel })) })
            }
          >
            {t('banner.cancel')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="callout callout--accent wrap"
      role="status"
      aria-label={t('banner.progressLabel')}
      style={{ alignItems: 'center', gap: 12 }}
    >
      <div className="min0" style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 700 }}>
          <span aria-hidden="true">{DOT}</span>
          {t('banner.line', {
            kind:
              r.status === 'approved' ? t('banner.approvedStarting', { kind: kindLabel(r) }) : t('banner.running', { kind: kindLabel(r) }),
            scope: r.scopeLabel,
            source: r.sourceLabel,
          })}
        </div>
        <div className="t-xs muted" style={{ marginTop: 3 }}>
          {r.pointInTime ? t('banner.replaying') : ''}
          {r.dryRun ? t('banner.sandbox') : t('banner.maintenance')}{' '}
          {t('banner.staff', { staged: r.stagedByName, approved: r.approvedByName ?? '—', eta: r.etaMinutes })}
        </div>
      </div>
      <div style={{ width: 180 }}>
        <Bar value={Math.max(2, r.progress)} label={t('banner.barLabel', { progress: r.progress })} />
        <div className="t-xs muted" style={{ marginTop: 4, textAlign: 'right' }}>
          {t('banner.percent', { progress: r.progress })}
        </div>
      </div>
    </div>
  );
}
