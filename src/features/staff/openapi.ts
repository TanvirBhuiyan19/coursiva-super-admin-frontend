import { ROLES } from '@/features/auth/permissions';
import { arrayOf, defineSpec, listParams, paginated, ref, resource, type EndpointDef, type ParamDef } from '@/openapi/dsl';

const id: Record<string, ParamDef> = { id: { type: 'string', description: 'Staff member id, e.g. `st_priya`.' } };
const example = { params: { id: 'st_priya' } };

/** POST /staff/{id}/{action} — single-purpose member actions returning the updated member. */
const action = (path: string, summary: string, audit: string, extra: Partial<EndpointDef> = {}): EndpointDef => ({
  method: 'POST',
  path: `/staff/{id}/${path}`,
  summary,
  auth: 'staff.manage',
  path_params: id,
  response: resource(ref('StaffMember')),
  errors: [404, 422],
  audit: { text: audit, category: 'Security' },
  example,
  ...extra,
});

export const spec = defineSpec({
  tag: 'Staff',
  description:
    'Platform staff (the console login users), invitations, access reviews, just-in-time elevation and role permissions. ' +
    'Nobody can change their own role or scope, suspend/reinstate/elevate themselves or confirm their own review; Owner accounts cannot be changed here (422).',
  endpoints: [
    {
      method: 'GET',
      path: '/staff',
      summary: 'List staff members',
      description: 'Sorted by role (Owner first) unless `sort` is given.',
      auth: 'staff.view',
      query: {
        ...listParams(['role', 'name', 'last_seen_at']),
        role: { type: 'string', enum: ROLES },
        status: { type: 'string', enum: ['Active', 'Invited', 'Suspended'] },
      },
      response: paginated(ref('StaffMember')),
      example: { query: { per_page: 100 } },
    },
    {
      method: 'GET',
      path: '/staff/summary',
      summary: 'Staff KPIs (2FA coverage, elevation, reviews due)',
      auth: 'staff.view',
      response: resource(ref('StaffSummary')),
    },
    {
      method: 'GET',
      path: '/staff/activity',
      summary: 'Recent actions by staff members (System entries excluded)',
      auth: 'staff.view',
      query: { page: { type: 'integer' }, per_page: { type: 'integer' } },
      response: paginated(ref('StaffActivity')),
      example: { query: { per_page: 6 } },
    },
    {
      method: 'GET',
      path: '/staff/roles',
      summary: 'Permissions for every role',
      auth: 'staff.view',
      response: resource(arrayOf(ref('RolePermissions'))),
    },
    {
      method: 'PUT',
      path: '/staff/roles/{role}',
      summary: "Replace a role's permissions",
      description:
        'Owner is locked (422). Nobody can remove `staff.manage` from their own role (422). One audit entry per granted/removed permission.',
      auth: 'staff.manage',
      path_params: { role: { type: 'string', enum: ROLES, description: 'Role name (URL-encoded), e.g. `Read-only`.' } },
      body: {
        type: 'object',
        required: ['permissions'],
        properties: {
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Permission keys from `src/features/auth/permissions.ts`.',
          },
        },
      },
      response: resource(arrayOf(ref('RolePermissions'))),
      errors: [404],
      audit: { text: 'Granted “{permission}” to the {role} role · Removed “{permission}” from the {role} role', category: 'Security' },
      example: { params: { role: 'Support' }, body: { permissions: ['tenants.view', 'support.view', 'support.manage'] } },
    },
    {
      method: 'POST',
      path: '/staff/invitations',
      summary: 'Invite a staff member',
      description: 'Creates the member with `status: "Invited"`; the name is derived from the email until the invite is accepted.',
      auth: 'staff.manage',
      body: ref('InviteStaffInput'),
      response: resource(ref('StaffMember'), 201),
      audit: { text: 'Invited {email} to the platform team as {role}', category: 'Security' },
      example: { body: { email: 'jo.bloggs@coursiva.com', role: 'Support' } },
    },
    {
      method: 'PATCH',
      path: '/staff/{id}',
      summary: 'Change role and/or tenant scope',
      auth: 'staff.manage',
      path_params: id,
      body: ref('StaffUpdate'),
      response: resource(ref('StaffMember')),
      errors: [404],
      audit: { text: 'Changed {name}’s staff role from {a} to {b} · Scoped {name} to {scope}', category: 'Security' },
      example: { ...example, body: { role: 'Finance', scope: 'enterprise' } },
    },
    action('suspend', 'Suspend a member (revokes sessions and elevation)', 'Suspended staff member {name} — sessions revoked'),
    action('reinstate', 'Reinstate a suspended member', 'Reinstated staff member {name}', {
      example: { skip: 'No suspended staff member in the seed data.' },
    }),
    action('resend-invite', 'Re-send a pending invite', 'Re-sent the staff invite to {email}', { example: { params: { id: 'st_dana' } } }),
    action('revoke-sessions', 'Sign a member out of all sessions', 'Signed {name} out of all sessions'),
    action(
      'elevate',
      'Grant just-in-time Owner access (expires on its own)',
      'Elevated {name} to Owner for {minutes} minutes (just-in-time)',
      {
        body: { type: 'object', properties: { minutes: { type: 'integer', minimum: 15, maximum: 240, default: 60 } } },
        example: { ...example, body: { minutes: 30 } },
      },
    ),
    {
      method: 'DELETE',
      path: '/staff/{id}/elevation',
      summary: 'Revoke just-in-time elevation',
      description: 'No-op (and no audit entry) when the member is not elevated.',
      auth: 'staff.manage',
      path_params: id,
      response: resource(ref('StaffMember')),
      errors: [404],
      audit: { text: 'Revoked just-in-time Owner elevation for {name}', category: 'Security' },
      example,
    },
    action('review', 'Confirm a member’s access in the quarterly review', 'Confirmed {name}’s access ({role}) in the quarterly review'),
  ],
});
