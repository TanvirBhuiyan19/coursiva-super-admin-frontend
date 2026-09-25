import { useEffect } from 'react';
import { Avatar, Badge, ConfirmButton, Empty, Select, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { cx } from '@/lib/cx';
import type { Tone } from '@/lib/domain';
import { avatarColor, initials, timeAgo } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useElevateStaff, useStaffAction, useUpdateStaff } from '../api';
import { useT } from '../i18n';
import { ASSIGNABLE_ROLES, STAFF_SCOPES, type AssignableRole, type StaffMember, type StaffStatus } from '../types';

const COLS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,0.45fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,1.9fr)';
const MIN_W = 1180;

const STATUS_TONE: Record<StaffStatus, Tone> = { Active: 'good', Invited: 'warn', Suspended: 'bad' };

const minutesLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

function RowActions({ m }: { m: StaffMember }) {
  const t = useT();
  const tc = useCommonT();
  const action = useStaffAction();
  const elevate = useElevateStaff();
  const busy = action.isPending || elevate.isPending;
  const run = (a: Parameters<typeof action.mutate>[0]['action'], message: string) =>
    action.mutate({ id: m.id, action: a }, { onSuccess: () => toast(message) });

  if (m.status === 'Invited')
    return (
      <button
        type="button"
        className="link"
        style={{ fontSize: 12 }}
        disabled={busy}
        aria-label={t('actions.resendInviteFor', { name: m.name })}
        onClick={() => run('resend-invite', t('toasts.inviteResent', { email: m.email }))}
      >
        {t('actions.resendInvite')}
      </button>
    );

  if (m.status === 'Suspended')
    return (
      <button
        type="button"
        className="link"
        style={{ fontSize: 12 }}
        disabled={busy}
        aria-label={t('actions.reinstateFor', { name: m.name })}
        onClick={() => run('reinstate', t('toasts.reinstated', { name: m.name }))}
      >
        {t('actions.reinstate')}
      </button>
    );

  return (
    <div className="hstack wrap" style={{ gap: 8 }}>
      <button
        type="button"
        className={m.elevatedUntil ? 'badge tone-warn' : 'link link--muted'}
        style={{ fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}
        title={t('actions.elevateTitle')}
        disabled={busy}
        aria-label={m.elevatedUntil ? t('actions.revokeElevationFor', { name: m.name }) : t('actions.elevateFor', { name: m.name })}
        onClick={() =>
          elevate.mutate(
            { id: m.id, elevate: !m.elevatedUntil },
            {
              onSuccess: () =>
                toast(m.elevatedUntil ? t('toasts.elevationRevoked', { name: m.name }) : t('toasts.elevated', { name: m.name })),
            },
          )
        }
      >
        {m.elevatedUntil ? t('actions.elevatedLeft', { minutes: minutesLeft(m.elevatedUntil) }) : t('actions.elevate')}
      </button>
      <button
        type="button"
        className="link link--muted"
        style={{ fontSize: 12 }}
        disabled={busy}
        aria-label={t('actions.signOutFor', { name: m.name })}
        onClick={() => run('revoke-sessions', t('toasts.signedOut', { name: m.name }))}
      >
        {tc('actions.signOut')}
      </button>
      <ConfirmButton
        className="link link--muted"
        style={{ fontSize: 12 }}
        confirmLabel={t('actions.confirmSuspend')}
        pending={action.isPending && action.variables.action === 'suspend'}
        onConfirm={() => run('suspend', t('toasts.suspended', { name: m.name }))}
      >
        {t('actions.suspend')} <span className="sr-only">{m.name}</span>
      </ConfirmButton>
    </div>
  );
}

function StaffRowView({ m, highlighted }: { m: StaffMember; highlighted: boolean }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const update = useUpdateStaff();
  const editable = can('staff.manage') && !m.isSelf && m.role !== 'Owner';

  return (
    <div
      id={`staff-${m.id}`}
      role="row"
      tabIndex={-1}
      className={cx('trow', highlighted && 'is-selected')}
      style={{ gridTemplateColumns: COLS, minWidth: MIN_W, padding: '12px 0' }}
      data-member={m.id}
    >
      <div role="cell" className="hstack min0" style={{ gap: 10 }}>
        <Avatar text={initials(m.name, 3)} color={avatarColor(m.id)} round />
        <div className="min0">
          <div className="ellipsis" style={{ fontWeight: 600 }}>
            {m.name}{' '}
            {m.isSelf && (
              <Badge xs tone="accent">
                {t('table.you')}
              </Badge>
            )}
          </div>
          <div className="faint ellipsis" style={{ fontSize: 11 }}>
            {t('table.actions30d', { count: m.actions30d })}
          </div>
        </div>
      </div>
      <div role="cell" className="muted ellipsis">
        {m.email}
      </div>
      <div role="cell">
        {editable ? (
          <Select<AssignableRole>
            label={t('table.roleFor', { name: m.name })}
            value={m.role as AssignableRole}
            options={ASSIGNABLE_ROLES.map((r) => [r, t(`roles.${r}`)] as const)}
            disabled={update.isPending}
            style={{ fontSize: 12, padding: '6px 8px' }}
            onChange={(role) =>
              update.mutate(
                { id: m.id, role },
                { onSuccess: () => toast(t('toasts.roleChanged', { name: m.name, role: t(`roles.${role}`) })) },
              )
            }
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700 }}>{t(`roles.${m.role}`)}</span>
        )}
      </div>
      <div role="cell">
        {editable ? (
          <Select
            label={t('table.scopeFor', { name: m.name })}
            value={m.scope}
            options={STAFF_SCOPES.map((s) => [s, t(`scopes.${s}`)] as const)}
            disabled={update.isPending}
            style={{ fontSize: 12, padding: '6px 8px' }}
            onChange={(scope) =>
              update.mutate({ id: m.id, scope }, { onSuccess: () => toast(t(`toasts.scoped.${scope}`, { name: m.name })) })
            }
          />
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            {t(`scopes.${m.scope}`)}
          </span>
        )}
      </div>
      <div role="cell">
        <Badge tone={m.twoFactorEnabled ? 'good' : m.status === 'Invited' ? 'flat' : 'bad'}>
          {m.twoFactorEnabled ? tc('states.on') : tc('states.off')}
        </Badge>
      </div>
      <div role="cell" className="min0">
        <div className="nowrap">
          {m.lastSeenAt ? timeAgo(m.lastSeenAt) : m.inviteSentAt ? t('table.invitedAgo', { ago: timeAgo(m.inviteSentAt) }) : '—'}
        </div>
        <div className="faint ellipsis" style={{ fontSize: 11 }}>
          {m.location}
        </div>
      </div>
      <div role="cell">
        <Badge tone={STATUS_TONE[m.status]}>{t(`status.${m.status}`)}</Badge>
      </div>
      <div role="cell" className="min0">
        {editable ? <RowActions m={m} /> : m.isSelf ? <span className="t-xs faint">{t('table.yourAccount')}</span> : null}
      </div>
    </div>
  );
}

export function StaffTable({ rows, loading, highlight }: { rows: StaffMember[] | undefined; loading: boolean; highlight: string }) {
  const t = useT();
  // Deep link (/staff?member=<id>, used by global search): bring the member into view.
  const found = !!rows?.some((m) => m.id === highlight);
  useEffect(() => {
    if (highlight && found) document.getElementById(`staff-${highlight}`)?.focus();
  }, [highlight, found]);

  return (
    <div role="table" aria-label={t('page.title')}>
      <TRow cols={COLS} min={MIN_W} head>
        <div role="columnheader">{t('table.columns.member')}</div>
        <div role="columnheader">{t('table.columns.email')}</div>
        <div role="columnheader">{t('table.columns.role')}</div>
        <div role="columnheader">{t('table.columns.scope')}</div>
        <div role="columnheader">{t('table.columns.twoFactor')}</div>
        <div role="columnheader">{t('table.columns.lastActive')}</div>
        <div role="columnheader">{t('table.columns.status')}</div>
        <div role="columnheader">{t('table.columns.actions')}</div>
      </TRow>
      {loading && <SkeletonRows rows={5} h={22} />}
      {rows?.map((m) => (
        <StaffRowView key={m.id} m={m} highlighted={m.id === highlight} />
      ))}
      {rows?.length === 0 && <Empty>{t('table.empty')}</Empty>}
    </div>
  );
}
