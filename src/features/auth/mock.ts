// Mock implementation of the auth endpoints (Laravel Sanctum SPA + Fortify-style 2FA).
import { http } from 'msw';
import { platformSettings, session, staff, type StaffRow } from '@/mocks/collections';
import { authorize, handle, HttpError, invalid, noContent, ok, permissionsOf, readBody, recordAudit, route } from '@/mocks/http';
import type { LoginInput, User } from './types';

export const toUser = (s: StaffRow): User => ({
  id: s.id,
  name: s.name,
  email: s.email,
  role: s.role,
  twoFactorEnabled: s.twoFactorEnabled,
  permissions: permissionsOf(s),
  idleLockMinutes: platformSettings.get().idleLockMinutes,
});

/** Mock 2FA code (a real backend verifies a TOTP). */
export const MOCK_TOTP = '123456';

export const handlers = [
  http.get(
    route('/auth/me'),
    handle(() => ok(toUser(authorize()))),
  ),

  http.post(
    route('/auth/login'),
    handle(async ({ request }) => {
      const body = await readBody<LoginInput>(request);
      const errors: Record<string, string> = {};
      if (!body.email?.trim()) errors.email = 'The email field is required.';
      if (!body.password) errors.password = 'The password field is required.';
      if (Object.keys(errors).length) throw invalid(errors);
      const user = staff.where((s) => s.email.toLowerCase() === body.email.trim().toLowerCase())[0];
      if (!user || user.password !== body.password) throw invalid({ email: 'These credentials do not match our records.' });
      if (user.status === 'Suspended') throw invalid({ email: 'This account is suspended. Contact a platform owner.' });
      if (user.status === 'Invited') throw invalid({ email: 'Accept your invite email before signing in.' });
      if (user.twoFactorEnabled) {
        session.patch({ pendingTwoFactorUserId: user.id, userId: null });
        return ok({ twoFactorRequired: true, user: null });
      }
      session.patch({ userId: user.id, pendingTwoFactorUserId: null });
      staff.update(user.id, { lastSeenAt: new Date().toISOString() });
      recordAudit('Signed in to the platform console', 'Auth');
      return ok({ twoFactorRequired: false, user: toUser(user) });
    }),
  ),

  http.post(
    route('/auth/two-factor-challenge'),
    handle(async ({ request }) => {
      const { code } = await readBody<{ code: string }>(request);
      const pending = session.get().pendingTwoFactorUserId;
      if (!pending) throw new HttpError(419, 'Your sign-in expired. Start again.');
      if ((code ?? '').replace(/\s/g, '') !== MOCK_TOTP)
        throw invalid({ code: 'The provided two factor authentication code was invalid.' });
      session.patch({ userId: pending, pendingTwoFactorUserId: null });
      const user = staff.update(pending, { lastSeenAt: new Date().toISOString() })!;
      recordAudit('Signed in to the platform console (2FA)', 'Auth');
      return ok(toUser(user));
    }),
  ),

  // Laravel Fortify's password confirmation: unlocks an idle-locked console without a new session.
  http.post(
    route('/auth/confirm-password'),
    handle(async ({ request }) => {
      const user = authorize();
      const { password } = await readBody<{ password: string }>(request);
      if (!password || password !== user.password) throw invalid({ password: 'The provided password was incorrect.' });
      recordAudit('Unlocked the console after an idle lock', 'Auth');
      return noContent();
    }),
  ),

  http.post(
    route('/auth/logout'),
    handle(() => {
      if (session.get().userId) recordAudit('Signed out', 'Auth');
      session.patch({ userId: null, pendingTwoFactorUserId: null });
      return noContent();
    }),
  ),
];
