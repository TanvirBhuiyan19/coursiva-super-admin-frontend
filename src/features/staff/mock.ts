// Mock implementation of /staff (Laravel: StaffController, StaffInvitationController, RolePermissionController + policies).
import { http } from 'msw';
import { audit, platformSettings, rolePermissions, staff, type StaffRow } from '@/mocks/collections';
import { ago, collection, id } from '@/mocks/db';
import { authorize, handle, invalid, notFound, ok, paginate, query, readBody, recordAudit, route, sortRows } from '@/mocks/http';
import { PERMISSION_LABELS, PERMISSIONS, ROLES, type Permission, type Role } from '@/features/auth/permissions';
import {
  ASSIGNABLE_ROLES,
  SCOPE_LABELS,
  STAFF_SCOPES,
  type InviteStaffInput,
  type RolePermissions,
  type StaffActivity,
  type StaffMember,
  type StaffScope,
  type StaffSummary,
  type StaffUpdate,
} from './types';

const MIN = 60_000;
const DAY = 1440 * MIN;
const REVIEW_DAYS = 90;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-staff access metadata the shared `staff` table doesn't hold (a `staff_access` table in Laravel). */
interface StaffAccessRow {
  id: string;
  scope: StaffScope;
  elevatedUntil: string | null;
  lastReviewedAt: string | null;
  inviteSentAt: string | null;
  sessionsRevokedAt: string | null;
}
const access = collection<StaffAccessRow>('staffAccess', () => [
  { id: 'st_sam', scope: 'all', elevatedUntil: null, lastReviewedAt: ago({ d: 12 }), inviteSentAt: null, sessionsRevokedAt: null },
  { id: 'st_priya', scope: 'all', elevatedUntil: null, lastReviewedAt: ago({ d: 21 }), inviteSentAt: null, sessionsRevokedAt: null },
  { id: 'st_lee', scope: 'assigned', elevatedUntil: null, lastReviewedAt: ago({ d: 94 }), inviteSentAt: null, sessionsRevokedAt: null },
  { id: 'st_fin', scope: 'all', elevatedUntil: null, lastReviewedAt: ago({ d: 40 }), inviteSentAt: null, sessionsRevokedAt: null },
  { id: 'st_dana', scope: 'all', elevatedUntil: null, lastReviewedAt: null, inviteSentAt: ago({ d: 17 }), sessionsRevokedAt: null },
]);

function accessOf(s: StaffRow): StaffAccessRow {
  const row = access.find(s.id);
  if (row) return row;
  return access.insert({
    id: s.id,
    scope: s.role === 'Support' ? 'assigned' : 'all',
    elevatedUntil: null,
    lastReviewedAt: null,
    inviteSentAt: null,
    sessionsRevokedAt: null,
  });
}

const isElevated = (a: StaffAccessRow) => !!a.elevatedUntil && new Date(a.elevatedUntil).getTime() > Date.now();

function toMember(s: StaffRow, viewer: StaffRow): StaffMember {
  const a = accessOf(s);
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    twoFactorEnabled: s.twoFactorEnabled,
    status: s.status,
    lastSeenAt: s.lastSeenAt,
    location: s.location,
    actions30d: s.actions30d,
    scope: s.role === 'Owner' ? 'all' : a.scope,
    elevatedUntil: isElevated(a) ? a.elevatedUntil : null,
    lastReviewedAt: a.lastReviewedAt,
    reviewDue: s.status !== 'Invited' && (!a.lastReviewedAt || Date.now() - new Date(a.lastReviewedAt).getTime() > REVIEW_DAYS * DAY),
    inviteSentAt: a.inviteSentAt,
    isSelf: s.id === viewer.id,
  };
}

const nameFromEmail = (email: string) =>
  email
    .split('@')[0]!
    .replace(/[._-]+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function findStaff(sid: string | readonly string[] | undefined) {
  const s = typeof sid === 'string' ? staff.find(sid) : undefined;
  if (!s) throw notFound('Staff member');
  return s;
}

/** Rules shared by every action on another member's account. */
function assertManageable(actor: StaffRow, target: StaffRow, what: string) {
  if (actor.id === target.id) throw invalid({ staff: `You can’t ${what} your own account — ask another platform owner.` });
  if (target.role === 'Owner') throw invalid({ staff: `Owner accounts can’t be changed from here.` });
}

const rolesResource = (): RolePermissions[] =>
  ROLES.map((role) => ({
    role,
    permissions: role === 'Owner' ? [...PERMISSIONS] : [...rolePermissions.get()[role]],
    locked: role === 'Owner',
    members: staff.where((s) => s.role === role && s.status !== 'Suspended').length,
  }));

type Params = { id: string };

export const handlers = [
  // ---------- Literal paths first ----------
  http.get(
    route('/staff/summary'),
    handle(() => {
      authorize('staff.view');
      const all = staff.all();
      const signedUp = all.filter((s) => s.status !== 'Invited');
      const withTfa = signedUp.filter((s) => s.twoFactorEnabled).length;
      const weekAgo = Date.now() - 7 * DAY;
      const summary: StaffSummary = {
        total: all.length,
        active: all.filter((s) => s.status === 'Active').length,
        invited: all.filter((s) => s.status === 'Invited').length,
        suspended: all.filter((s) => s.status === 'Suspended').length,
        twoFactorCoverage: signedUp.length ? Math.round((withTfa / signedUp.length) * 100) : 100,
        withoutTwoFactor: all.filter((s) => s.status === 'Active' && !s.twoFactorEnabled).map((s) => ({ id: s.id, name: s.name })),
        elevatedNow: all.filter((s) => isElevated(accessOf(s))).length,
        impersonations7d: audit.where((a) => a.action.startsWith('Signed in as owner') && new Date(a.createdAt).getTime() >= weekAgo)
          .length,
        reviewsDue: all.filter((s) => {
          const a = accessOf(s);
          return s.status !== 'Invited' && (!a.lastReviewedAt || Date.now() - new Date(a.lastReviewedAt).getTime() > REVIEW_DAYS * DAY);
        }).length,
        requireStaffTwoFactor: platformSettings.get().requireStaffTwoFactor,
      };
      return ok(summary);
    }),
  ),

  // Recent actions by staff (not System), from the shared audit table.
  http.get(
    route('/staff/activity'),
    handle(({ request }) => {
      authorize('staff.view');
      const ids = new Set(staff.all().map((s) => s.id));
      const rows = audit
        .where((a) => !!a.actorId && ids.has(a.actorId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map<StaffActivity>((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          actorId: a.actorId,
          actorName: a.actorName,
          action: a.action,
          category: a.category,
        }));
      return paginate(rows, request);
    }),
  ),

  http.get(
    route('/staff/roles'),
    handle(() => {
      authorize('staff.view');
      return ok(rolesResource());
    }),
  ),

  // Replaces a role's permissions. Owner is locked; nobody can remove "Manage staff" from their own role.
  http.put(
    route('/staff/roles/:role'),
    handle<{ role: string }>(async ({ request, params }) => {
      const actor = authorize('staff.manage');
      const role = decodeURIComponent(params.role) as Role;
      if (!ROLES.includes(role)) throw notFound('Role');
      if (role === 'Owner') throw invalid({ permissions: 'Owner permissions are locked — owners always have every permission.' });
      const body = await readBody<{ permissions: Permission[] }>(request);
      if (!Array.isArray(body.permissions)) throw invalid({ permissions: 'The permissions field must be a list.' });
      const unknown = body.permissions.filter((p) => !PERMISSIONS.includes(p));
      if (unknown.length) throw invalid({ permissions: `Unknown permission: ${unknown.join(', ')}.` });
      const next = PERMISSIONS.filter((p) => body.permissions.includes(p));
      if (actor.role === role && !next.includes('staff.manage'))
        throw invalid({ permissions: 'You can’t remove “Manage staff” from your own role.' });
      const prev = rolePermissions.get()[role];
      const granted = next.filter((p) => !prev.includes(p));
      const removed = prev.filter((p) => !next.includes(p));
      rolePermissions.patch({ [role]: next });
      for (const p of granted) recordAudit(`Granted “${PERMISSION_LABELS[p]}” to the ${role} role`, 'Security');
      for (const p of removed) recordAudit(`Removed “${PERMISSION_LABELS[p]}” from the ${role} role`, 'Security');
      return ok(rolesResource());
    }),
  ),

  http.post(
    route('/staff/invitations'),
    handle(async ({ request }) => {
      const actor = authorize('staff.manage');
      const body = await readBody<InviteStaffInput>(request);
      const email = (body.email ?? '').trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid work email address.';
      else if (staff.where((s) => s.email.toLowerCase() === email).length) errors.email = `${email} is already on the platform team.`;
      if (!(ASSIGNABLE_ROLES as readonly string[]).includes(body.role)) errors.role = 'Choose Admin, Support, Finance or Read-only.';
      if (Object.keys(errors).length) throw invalid(errors);
      const now = new Date().toISOString();
      const row: StaffRow = {
        id: id('st'),
        name: nameFromEmail(email),
        email,
        password: `invite-${Math.random().toString(36).slice(2)}`,
        role: body.role,
        twoFactorEnabled: false,
        status: 'Invited',
        lastSeenAt: null,
        location: 'Invite sent today',
        actions30d: 0,
        watchlist: [],
        elevatedUntil: null,
      };
      staff.insert(row);
      access.insert({
        id: row.id,
        scope: body.role === 'Support' ? 'assigned' : 'all',
        elevatedUntil: null,
        lastReviewedAt: null,
        inviteSentAt: now,
        sessionsRevokedAt: null,
      });
      recordAudit(`Invited ${email} to the platform team as ${body.role}`, 'Security');
      return ok(toMember(row, actor), 201);
    }),
  ),

  http.get(
    route('/staff'),
    handle(({ request }) => {
      const viewer = authorize('staff.view');
      const q = query(request);
      const role = q.get('role');
      const status = q.get('status');
      let rows = staff.all();
      if (role) rows = rows.filter((s) => s.role === role);
      if (status) rows = rows.filter((s) => s.status === status);
      if (q.search) rows = rows.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(q.search));
      const rank: Record<Role, number> = { Owner: 0, Admin: 1, Finance: 2, Support: 3, 'Read-only': 4 };
      rows = sortRows(rows, q.sort ?? 'role', { role: (s) => rank[s.role], name: (s) => s.name, last_seen_at: (s) => s.lastSeenAt ?? '' });
      return paginate(
        rows.map((s) => toMember(s, viewer)),
        request,
      );
    }),
  ),

  // ---------- Member actions ----------
  http.patch(
    route('/staff/:id'),
    handle<Params>(async ({ request, params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      const body = await readBody<StaffUpdate>(request);
      if (body.role !== undefined) {
        if (actor.id === target.id) throw invalid({ role: 'You can’t change your own role — ask another platform owner.' });
        if (target.role === 'Owner') throw invalid({ role: 'Owner accounts can’t be changed from here.' });
        if (!(ASSIGNABLE_ROLES as readonly string[]).includes(body.role))
          throw invalid({ role: 'Choose Admin, Support, Finance or Read-only.' });
      }
      if (body.scope !== undefined) {
        if (!STAFF_SCOPES.includes(body.scope)) throw invalid({ scope: 'The selected tenant scope is invalid.' });
        if (actor.id === target.id) throw invalid({ scope: 'You can’t change your own tenant scope.' });
        if (target.role === 'Owner') throw invalid({ scope: 'Owners always see every tenant.' });
      }
      if (body.role !== undefined && body.role !== target.role) {
        const from = target.role;
        staff.update(target.id, { role: body.role });
        recordAudit(`Changed ${target.name}’s staff role from ${from} to ${body.role}`, 'Security');
      }
      const a = accessOf(target);
      if (body.scope !== undefined && body.scope !== a.scope) {
        access.update(target.id, { scope: body.scope });
        recordAudit(`Scoped ${target.name} to ${SCOPE_LABELS[body.scope].toLowerCase()}`, 'Security');
      }
      return ok(toMember(target, actor));
    }),
  ),

  http.post(
    route('/staff/:id/suspend'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      assertManageable(actor, target, 'suspend');
      if (target.status !== 'Active') throw invalid({ staff: `${target.name} isn’t active.` });
      staff.update(target.id, { status: 'Suspended', elevatedUntil: null });
      access.update(accessOf(target).id, { elevatedUntil: null, sessionsRevokedAt: new Date().toISOString() });
      recordAudit(`Suspended staff member ${target.name} — sessions revoked`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),

  http.post(
    route('/staff/:id/reinstate'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      assertManageable(actor, target, 'reinstate');
      if (target.status !== 'Suspended') throw invalid({ staff: `${target.name} isn’t suspended.` });
      staff.update(target.id, { status: 'Active' });
      recordAudit(`Reinstated staff member ${target.name}`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),

  http.post(
    route('/staff/:id/resend-invite'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      if (target.status !== 'Invited') throw invalid({ staff: `${target.name} has already accepted their invite.` });
      access.update(accessOf(target).id, { inviteSentAt: new Date().toISOString() });
      staff.update(target.id, { location: 'Invite re-sent today' });
      recordAudit(`Re-sent the staff invite to ${target.email}`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),

  http.post(
    route('/staff/:id/revoke-sessions'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      if (actor.id === target.id) throw invalid({ staff: 'Sign out from the header to end your own session.' });
      if (target.status !== 'Active') throw invalid({ staff: `${target.name} has no active sessions.` });
      access.update(accessOf(target).id, { sessionsRevokedAt: new Date().toISOString() });
      recordAudit(`Signed ${target.name} out of all sessions`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),

  // Just-in-time Owner access that expires on its own.
  http.post(
    route('/staff/:id/elevate'),
    handle<Params>(async ({ request, params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      assertManageable(actor, target, 'elevate');
      if (target.status !== 'Active') throw invalid({ staff: `Only active staff can be elevated.` });
      const { minutes = 60 } = await readBody<{ minutes?: number }>(request);
      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 240) throw invalid({ minutes: 'Elevate for 15 to 240 minutes.' });
      const until = new Date(Date.now() + minutes * MIN).toISOString();
      access.update(accessOf(target).id, { elevatedUntil: until });
      staff.update(target.id, { elevatedUntil: until });
      recordAudit(`Elevated ${target.name} to Owner for ${minutes} minutes (just-in-time)`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),

  http.delete(
    route('/staff/:id/elevation'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      const a = accessOf(target);
      if (isElevated(a)) {
        access.update(a.id, { elevatedUntil: null });
        staff.update(target.id, { elevatedUntil: null });
        recordAudit(`Revoked just-in-time Owner elevation for ${target.name}`, 'Security');
      }
      return ok(toMember(target, actor));
    }),
  ),

  // Quarterly access review (SOC 2): someone other than the member confirms their access.
  http.post(
    route('/staff/:id/review'),
    handle<Params>(({ params }) => {
      const actor = authorize('staff.manage');
      const target = findStaff(params.id);
      if (actor.id === target.id) throw invalid({ staff: 'Another staff member must confirm your access.' });
      if (target.status === 'Invited') throw invalid({ staff: `${target.name} hasn’t accepted their invite yet.` });
      access.update(accessOf(target).id, { lastReviewedAt: new Date().toISOString() });
      recordAudit(`Confirmed ${target.name}’s access (${target.role}) in the quarterly review`, 'Security');
      return ok(toMember(target, actor));
    }),
  ),
];

/** Exposed for tests. */
export const staffTables = { access };
