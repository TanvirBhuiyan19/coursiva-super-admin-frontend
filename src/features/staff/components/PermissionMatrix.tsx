import { Card, QueryState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { PERMISSION_LABELS, PERMISSIONS, type Permission } from '@/features/auth/permissions';
import { plural } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRolePermissions, useSetRolePermission } from '../api';
import type { RolePermissions } from '../types';

const GROUP_LABELS: Record<string, string> = {
  tenants: 'Tenants',
  billing: 'Billing',
  support: 'Support',
  analytics: 'Analytics',
  governance: 'Governance',
  platform: 'Platform',
  flags: 'Platform',
  announcements: 'Platform',
  staff: 'Staff & audit',
  audit: 'Staff & audit',
};
const groupOf = (p: Permission) => GROUP_LABELS[p.split('.')[0]!] ?? 'Other';

function Cell({ role, permission, manage }: { role: RolePermissions; permission: Permission; manage: boolean }) {
  const set = useSetRolePermission();
  const on = role.locked || role.permissions.includes(permission);
  const label = PERMISSION_LABELS[permission];
  const disabled = role.locked || !manage;
  return (
    <div role="cell" style={{ display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        aria-pressed={on}
        disabled={disabled}
        aria-label={`${label} — ${role.role}${role.locked ? ' (locked)' : ''}`}
        onClick={() => {
          const permissions = on ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission];
          set.mutate(
            { role: role.role, permissions, permission, granted: !on },
            {
              onSuccess: () =>
                toast(
                  `${label} ${on ? 'removed from' : 'granted to'} ${role.role} — ${plural(role.members, 'member')} ${on ? 'lose' : 'get'} it on their next request`,
                ),
            },
          );
        }}
        style={{
          width: '100%',
          maxWidth: 88,
          height: 30,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 13,
          cursor: disabled ? 'default' : 'pointer',
          border: `1.5px solid ${on && !role.locked ? 'var(--ac)' : 'var(--bd)'}`,
          background: on ? (role.locked ? 'var(--bd2)' : 'var(--acT)') : 'var(--card)',
          color: role.locked ? 'var(--tx2)' : 'var(--ac)',
          opacity: disabled && !role.locked ? 0.7 : 1,
        }}
      >
        <span aria-hidden="true">{on ? '✓' : ''}</span>
      </button>
    </div>
  );
}

/** Edits the shared `rolePermissions` table. Owner is locked; changes apply to every member of the role. */
export function PermissionMatrix() {
  const can = useCan();
  const manage = can('staff.manage');
  const q = useRolePermissions();
  const cols = (n: number) => `minmax(170px,1.6fr) repeat(${n}, minmax(64px,1fr))`;

  return (
    <Card title="Role permissions">
      <p className="t-sm muted" style={{ marginTop: -4 }}>
        What each staff role can do. Owner is locked — {manage ? 'click any other cell to change it' : 'you can view the matrix'}. Changes
        apply to everyone in the role immediately and are recorded in the audit log.
      </p>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={8} />}>
        {(roles) => (
          <div className="table-scroll" style={{ position: 'relative' }}>
            <div role="table" aria-label="Role permissions" style={{ minWidth: 620 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: cols(roles.length), gap: 6, marginTop: 8 }}>
                <div role="columnheader">
                  <span className="sr-only">Permission</span>
                </div>
                {roles.map((r) => (
                  <div
                    key={r.role}
                    role="columnheader"
                    className="faint"
                    style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
                  >
                    {r.role}
                    <div style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{plural(r.members, 'member')}</div>
                  </div>
                ))}
              </div>
              {PERMISSIONS.map((p, i) => {
                const group = groupOf(p);
                const newGroup = i === 0 || groupOf(PERMISSIONS[i - 1]!) !== group;
                return (
                  <div
                    key={p}
                    role="row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: cols(roles.length),
                      gap: 6,
                      alignItems: 'center',
                      padding: '4px 0',
                      borderTop: newGroup ? '1px solid var(--bd2)' : undefined,
                      marginTop: newGroup ? 6 : 0,
                      paddingTop: newGroup ? 10 : 4,
                    }}
                  >
                    <div role="rowheader" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {newGroup && (
                        <div
                          className="faint"
                          style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                        >
                          {group}
                        </div>
                      )}
                      {PERMISSION_LABELS[p]}
                    </div>
                    {roles.map((r) => (
                      <Cell key={r.role} role={r} permission={p} manage={manage} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </QueryState>
    </Card>
  );
}
