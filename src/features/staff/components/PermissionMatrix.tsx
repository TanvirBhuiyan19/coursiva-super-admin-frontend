import { Card, QueryState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { PERMISSIONS, type Permission } from '@/features/auth/permissions';
import { toast } from '@/store/ui';
import { useRolePermissions, useSetRolePermission } from '../api';
import { t as tStaff, useT } from '../i18n';
import type { RolePermissions } from '../types';

type Group = 'tenants' | 'billing' | 'support' | 'analytics' | 'governance' | 'platform' | 'staffAudit' | 'ungrouped';
/** Permission prefix → matrix group. */
const GROUPS: Record<string, Group> = {
  tenants: 'tenants',
  billing: 'billing',
  support: 'support',
  analytics: 'analytics',
  governance: 'governance',
  platform: 'platform',
  flags: 'platform',
  announcements: 'platform',
  staff: 'staffAudit',
  audit: 'staffAudit',
};
const groupOf = (p: Permission): Group => GROUPS[p.split('.')[0]!] ?? 'ungrouped';

function Cell({ role, permission, manage }: { role: RolePermissions; permission: Permission; manage: boolean }) {
  const t = useT();
  const set = useSetRolePermission();
  const on = role.locked || role.permissions.includes(permission);
  const label = t(`permissions.labels.${permission}`);
  const disabled = role.locked || !manage;
  return (
    <div role="cell" style={{ display: 'flex', justifyContent: 'center' }}>
      <button
        type="button"
        aria-pressed={on}
        disabled={disabled}
        aria-label={t(role.locked ? 'permissions.cellLabelLocked' : 'permissions.cellLabel', {
          permission: label,
          role: t(`roles.${role.role}`),
        })}
        onClick={() => {
          const permissions = on ? role.permissions.filter((p) => p !== permission) : [...role.permissions, permission];
          set.mutate(
            { role: role.role, permissions, permission, granted: !on },
            {
              onSuccess: () =>
                toast(
                  tStaff(on ? 'permissions.toasts.removed' : 'permissions.toasts.granted', {
                    permission: label,
                    role: tStaff(`roles.${role.role}`),
                    count: role.members,
                  }),
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
  const t = useT();
  const can = useCan();
  const manage = can('staff.manage');
  const q = useRolePermissions();
  const cols = (n: number) => `minmax(170px,1.6fr) repeat(${n}, minmax(64px,1fr))`;

  return (
    <Card title={t('permissions.title')}>
      <p className="t-sm muted" style={{ marginTop: -4 }}>
        {manage ? t('permissions.introManage') : t('permissions.introView')}
      </p>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={8} />}>
        {(roles) => (
          <div className="table-scroll" style={{ position: 'relative' }}>
            <div role="table" aria-label={t('permissions.title')} style={{ minWidth: 620 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: cols(roles.length), gap: 6, marginTop: 8 }}>
                <div role="columnheader">
                  <span className="sr-only">{t('permissions.permission')}</span>
                </div>
                {roles.map((r) => (
                  <div
                    key={r.role}
                    role="columnheader"
                    className="faint"
                    style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
                  >
                    {t(`roles.${r.role}`)}
                    <div style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                      {t('permissions.members', { count: r.members })}
                    </div>
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
                          {t(`permissions.groups.${group}`)}
                        </div>
                      )}
                      {t(`permissions.labels.${p}`)}
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
