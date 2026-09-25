import { useEffect } from 'react';
import { Avatar, Badge, ConfirmButton, Empty, Select, SkeletonRows, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { cx } from '@/lib/cx';
import type { Tone } from '@/lib/domain';
import { avatarColor, initials, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useElevateStaff, useStaffAction, useUpdateStaff } from '../api';
import { ASSIGNABLE_ROLES, SCOPE_LABELS, STAFF_SCOPES, type AssignableRole, type StaffMember, type StaffStatus } from '../types';

const COLS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,0.45fr) minmax(0,1fr) minmax(0,0.7fr) minmax(0,1.9fr)';
const MIN_W = 1180;

const STATUS_TONE: Record<StaffStatus, Tone> = { Active: 'good', Invited: 'warn', Suspended: 'bad' };

const minutesLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));

function RowActions({ m }: { m: StaffMember }) {
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
        aria-label={`Resend invite to ${m.name}`}
        onClick={() => run('resend-invite', `Invite re-sent to ${m.email} — expires in 7 days`)}
      >
        Resend invite
      </button>
    );

  if (m.status === 'Suspended')
    return (
      <button
        type="button"
        className="link"
        style={{ fontSize: 12 }}
        disabled={busy}
        aria-label={`Reinstate ${m.name}`}
        onClick={() => run('reinstate', `${m.name} reinstated — they can sign in again`)}
      >
        Reinstate
      </button>
    );

  return (
    <div className="hstack wrap" style={{ gap: 8 }}>
      <button
        type="button"
        className={m.elevatedUntil ? 'badge tone-warn' : 'link link--muted'}
        style={{ fontSize: 11.5, fontWeight: 700, border: 'none', cursor: 'pointer' }}
        title="Just-in-time Owner access for 60 minutes"
        disabled={busy}
        aria-label={m.elevatedUntil ? `Revoke elevation for ${m.name}` : `Elevate ${m.name} to Owner for 60 minutes`}
        onClick={() =>
          elevate.mutate(
            { id: m.id, elevate: !m.elevatedUntil },
            {
              onSuccess: () =>
                toast(
                  m.elevatedUntil
                    ? `Elevation revoked for ${m.name}`
                    : `${m.name} elevated to Owner for 60 minutes — logged and auto-expiring`,
                ),
            },
          )
        }
      >
        {m.elevatedUntil ? `Elevated · ${minutesLeft(m.elevatedUntil)}m left` : 'Elevate'}
      </button>
      <button
        type="button"
        className="link link--muted"
        style={{ fontSize: 12 }}
        disabled={busy}
        aria-label={`Sign ${m.name} out of all sessions`}
        onClick={() => run('revoke-sessions', `${m.name} signed out of every session — they’ll need to sign in again`)}
      >
        Sign out
      </button>
      <ConfirmButton
        className="link link--muted"
        style={{ fontSize: 12 }}
        confirmLabel="Confirm suspend"
        pending={action.isPending && action.variables.action === 'suspend'}
        onConfirm={() => run('suspend', `${m.name} suspended — sessions revoked immediately, sign-in blocked`)}
      >
        Suspend <span className="sr-only">{m.name}</span>
      </ConfirmButton>
    </div>
  );
}

function StaffRowView({ m, highlighted }: { m: StaffMember; highlighted: boolean }) {
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
                You
              </Badge>
            )}
          </div>
          <div className="faint ellipsis" style={{ fontSize: 11 }}>
            {m.actions30d} actions · 30d
          </div>
        </div>
      </div>
      <div role="cell" className="muted ellipsis">
        {m.email}
      </div>
      <div role="cell">
        {editable ? (
          <Select<AssignableRole>
            label={`Role for ${m.name}`}
            value={m.role as AssignableRole}
            options={ASSIGNABLE_ROLES}
            disabled={update.isPending}
            style={{ fontSize: 12, padding: '6px 8px' }}
            onChange={(role) => update.mutate({ id: m.id, role }, { onSuccess: () => toast(`${m.name} is now ${role}`) })}
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700 }}>{m.role}</span>
        )}
      </div>
      <div role="cell">
        {editable ? (
          <Select
            label={`Tenant scope for ${m.name}`}
            value={m.scope}
            options={STAFF_SCOPES.map((s) => [s, SCOPE_LABELS[s]] as const)}
            disabled={update.isPending}
            style={{ fontSize: 12, padding: '6px 8px' }}
            onChange={(scope) =>
              update.mutate({ id: m.id, scope }, { onSuccess: () => toast(`${m.name} scoped to ${SCOPE_LABELS[scope].toLowerCase()}`) })
            }
          />
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            {SCOPE_LABELS[m.scope]}
          </span>
        )}
      </div>
      <div role="cell">
        <Badge tone={m.twoFactorEnabled ? 'good' : m.status === 'Invited' ? 'flat' : 'bad'}>{m.twoFactorEnabled ? 'On' : 'Off'}</Badge>
      </div>
      <div role="cell" className="min0">
        <div className="nowrap">{m.lastSeenAt ? timeAgo(m.lastSeenAt) : m.inviteSentAt ? `Invited ${timeAgo(m.inviteSentAt)}` : '—'}</div>
        <div className="faint ellipsis" style={{ fontSize: 11 }}>
          {m.location}
        </div>
      </div>
      <div role="cell">
        <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
      </div>
      <div role="cell" className="min0">
        {editable ? <RowActions m={m} /> : m.isSelf ? <span className="t-xs faint">Your account</span> : null}
      </div>
    </div>
  );
}

export function StaffTable({ rows, loading, highlight }: { rows: StaffMember[] | undefined; loading: boolean; highlight: string }) {
  // Deep link (/staff?member=<id>, used by global search): bring the member into view.
  const found = !!rows?.some((m) => m.id === highlight);
  useEffect(() => {
    if (highlight && found) document.getElementById(`staff-${highlight}`)?.focus();
  }, [highlight, found]);

  return (
    <div role="table" aria-label="Platform staff">
      <TRow cols={COLS} min={MIN_W} head>
        <div role="columnheader">Member</div>
        <div role="columnheader">Email</div>
        <div role="columnheader">Role</div>
        <div role="columnheader">Tenant scope</div>
        <div role="columnheader">2FA</div>
        <div role="columnheader">Last active</div>
        <div role="columnheader">Status</div>
        <div role="columnheader">Actions</div>
      </TRow>
      {loading && <SkeletonRows rows={5} h={22} />}
      {rows?.map((m) => (
        <StaffRowView key={m.id} m={m} highlighted={m.id === highlight} />
      ))}
      {rows?.length === 0 && <Empty>No staff match these filters.</Empty>}
    </div>
  );
}
