// Mock implementation of the auth endpoints (Laravel Sanctum SPA + Fortify-style 2FA).
import { http } from 'msw';
import { audit, issuePasswordReset, passwordResets, platformSettings, session, staff, type StaffRow } from '@/mocks/collections';
import { id } from '@/mocks/db';
import {
  authenticate,
  handle,
  HttpError,
  invalid,
  json,
  noContent,
  ok,
  permissionsOf,
  readBody,
  recordAudit,
  requireRecentPassword,
  route,
  twoFactorSetupRequired,
} from '@/mocks/http';
import type {
  Branding,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  PasswordResetDone,
  PasswordResetSent,
  PasswordUpdated,
  RecoveryCodes,
  ResetPasswordInput,
  TwoFactorSetup,
  User,
} from './types';

export const toUser = (s: StaffRow): User => ({
  id: s.id,
  name: s.name,
  email: s.email,
  role: s.role,
  twoFactorEnabled: s.twoFactorEnabled,
  twoFactorSetupRequired: twoFactorSetupRequired(s),
  permissions: permissionsOf(s),
  idleLockMinutes: platformSettings.get().idleLockMinutes,
});

/** Mock 2FA code (a real backend verifies a TOTP). */
export const MOCK_TOTP = '123456';
/** Mock TOTP secret handed out by `POST /auth/two-factor` (base32, like Google2FA's). */
export const MOCK_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Laravel `staff_password_resets` TTLs: 60 min for a reset, 7 days for an invitation. */
const RESET_TTL_MS = 60 * 60_000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;

/** Ten single-use recovery codes like Laravel's (`xxxxx-xxxxx`). */
const newRecoveryCodes = () =>
  Array.from({ length: 10 }, () => {
    const part = () => Math.random().toString(36).slice(2, 7).padEnd(5, '0');
    return `${part()}-${part()}`;
  });

/** Laravel's `password` rules for staff: required, confirmed, min 8 (production adds letters/numbers/uncompromised). */
function passwordErrors(password: string | undefined, confirmation: string | undefined): Record<string, string> {
  if (!password) return { password: 'The password field is required.' };
  if (password !== confirmation) return { password: 'The password field confirmation does not match.' };
  if (password.length < 8) return { password: 'The password field must be at least 8 characters.' };
  return {};
}

/** Public brand images by slot (rows persisted before brand assets existed have none). */
const brandUrl = (slot: string) => platformSettings.get().brandAssets?.find((a) => a.slot === slot)?.url ?? null;

export const handlers = [
  // Public (no session): the sign-in screen shows it too. The real API sends `Cache-Control: public, max-age=300`.
  http.get(
    route('/platform/branding'),
    handle(() =>
      ok<Branding>({
        name: platformSettings.get().platformName,
        logoUrl: brandUrl('logo'),
        logoDarkUrl: brandUrl('logo_dark'),
        faviconUrl: brandUrl('favicon'),
      }),
    ),
  ),

  http.get(
    route('/auth/me'),
    handle(() => ok(toUser(authenticate()))),
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
      session.patch({ userId: user.id, pendingTwoFactorUserId: null, passwordConfirmedAt: new Date().toISOString() });
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
      const entered = (code ?? '').replace(/\s/g, '').toLowerCase();
      // Like Laravel's TwoFactorAuthenticator: a TOTP code, or one of the single-use recovery codes.
      const recovery = staff.find(pending)?.recoveryCodes ?? [];
      if (recovery.includes(entered)) staff.update(pending, { recoveryCodes: recovery.filter((c) => c !== entered) });
      else if (entered !== MOCK_TOTP) throw invalid({ code: 'The provided two factor authentication code was invalid.' });
      session.patch({ userId: pending, pendingTwoFactorUserId: null, passwordConfirmedAt: new Date().toISOString() });
      const user = staff.update(pending, { lastSeenAt: new Date().toISOString() })!;
      recordAudit('Signed in to the platform console (2FA)', 'Auth');
      return ok(toUser(user));
    }),
  ),

  // Laravel Fortify's password confirmation: unlocks an idle-locked console without a new session.
  http.post(
    route('/auth/confirm-password'),
    handle(async ({ request }) => {
      const user = authenticate();
      const { password } = await readBody<{ password: string }>(request);
      if (!password || password !== user.password) throw invalid({ password: 'The provided password was incorrect.' });
      session.patch({ passwordConfirmedAt: new Date().toISOString() });
      recordAudit('Confirmed their password', 'Auth');
      return noContent();
    }),
  ),

  // ---------- Credential self-service (Laravel StaffSecurityController) ----------

  http.post(
    route('/auth/forgot-password'),
    handle(async ({ request }) => {
      const { email: raw } = await readBody<Partial<ForgotPasswordInput>>(request);
      const email = (raw ?? '').trim().toLowerCase();
      if (!email) throw invalid({ email: 'The email field is required.' });
      if (!EMAIL_RE.test(email)) throw invalid({ email: 'The email field must be a valid email address.' });
      const member = staff.where((s) => s.email.toLowerCase() === email)[0];
      // No account enumeration: the answer is the same either way. At most one email a minute per address.
      const recent = passwordResets.find(email);
      if (member && member.status !== 'Suspended' && !(recent && Date.now() - new Date(recent.createdAt).getTime() < 60_000))
        issuePasswordReset(email);
      return json({
        data: { sent: true } satisfies PasswordResetSent,
        message: 'If an account exists for that email, we sent a link to reset the password.',
      });
    }),
  ),

  http.post(
    route('/auth/reset-password'),
    handle(async ({ request }) => {
      const body = await readBody<Partial<ResetPasswordInput>>(request);
      const email = (body.email ?? '').trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (!email) errors.email = 'The email field is required.';
      else if (!EMAIL_RE.test(email)) errors.email = 'The email field must be a valid email address.';
      if (!body.token) errors.token = 'The token field is required.';
      Object.assign(errors, passwordErrors(body.password, body.passwordConfirmation));
      if (Object.keys(errors).length) throw invalid(errors);
      const row = passwordResets.find(email);
      const member = row ? staff.where((s) => s.email.toLowerCase() === email)[0] : undefined;
      const ttl = member?.status === 'Invited' ? INVITE_TTL_MS : RESET_TTL_MS;
      const valid = row && member && row.token === body.token && Date.now() - new Date(row.createdAt).getTime() < ttl;
      if (!valid || member.status === 'Suspended') throw invalid({ token: 'This password reset link is invalid or has expired.' });
      // Proving control of the mailbox also completes a pending invitation.
      staff.update(member.id, { password: body.password!, status: member.status === 'Invited' ? 'Active' : member.status });
      passwordResets.remove(email);
      audit.insert({
        id: id('au'),
        createdAt: new Date().toISOString(),
        actorId: member.id,
        actorName: member.name,
        action: 'Reset their password',
        category: 'Security',
        tenantId: null,
        ip: '203.0.113.10',
      });
      return json({ data: { reset: true } satisfies PasswordResetDone, message: 'Your password has been reset. You can sign in now.' });
    }),
  ),

  http.put(
    route('/auth/password'),
    handle(async ({ request }) => {
      const user = authenticate();
      const body = await readBody<Partial<ChangePasswordInput>>(request);
      const errors: Record<string, string> = {};
      if (!body.currentPassword) errors.currentPassword = 'The current password field is required.';
      Object.assign(errors, passwordErrors(body.password, body.passwordConfirmation));
      if (Object.keys(errors).length) throw invalid(errors);
      if (body.currentPassword !== user.password) throw invalid({ currentPassword: 'The current password is incorrect.' });
      staff.update(user.id, { password: body.password! });
      recordAudit('Changed their password', 'Security');
      return ok<PasswordUpdated>({ updated: true });
    }),
  ),

  http.post(
    route('/auth/two-factor'),
    handle(() => {
      const user = authenticate();
      requireRecentPassword();
      if (user.twoFactorEnabled) throw new HttpError(409, 'Two-factor authentication is already enabled.');
      staff.update(user.id, { twoFactorPending: true, recoveryCodes: [] });
      const label = encodeURIComponent(`Coursiva:${user.email}`);
      return ok<TwoFactorSetup>({
        secret: MOCK_TOTP_SECRET,
        otpauthUrl: `otpauth://totp/${label}?secret=${MOCK_TOTP_SECRET}&issuer=Coursiva`,
      });
    }),
  ),

  http.post(
    route('/auth/two-factor/confirm'),
    handle(async ({ request }) => {
      const user = authenticate();
      const { code } = await readBody<{ code?: string }>(request);
      if (!code) throw invalid({ code: 'The code field is required.' });
      if (!user.twoFactorPending || user.twoFactorEnabled) throw new HttpError(409, 'Start two-factor setup first.');
      if (code.replace(/\s/g, '') !== MOCK_TOTP) throw invalid({ code: 'The provided two factor authentication code was invalid.' });
      const recoveryCodes = newRecoveryCodes();
      staff.update(user.id, { twoFactorEnabled: true, twoFactorPending: false, recoveryCodes });
      recordAudit('Enabled two-factor authentication', 'Security');
      return ok<RecoveryCodes>({ recoveryCodes });
    }),
  ),

  http.delete(
    route('/auth/two-factor'),
    handle(() => {
      const user = authenticate();
      requireRecentPassword();
      staff.update(user.id, { twoFactorEnabled: false, twoFactorPending: false, recoveryCodes: [] });
      recordAudit('Disabled two-factor authentication', 'Security');
      return noContent();
    }),
  ),

  http.post(
    route('/auth/two-factor/recovery-codes'),
    handle(() => {
      const user = authenticate();
      requireRecentPassword();
      if (!user.twoFactorEnabled) throw new HttpError(409, 'Two-factor authentication is not enabled.');
      const recoveryCodes = newRecoveryCodes();
      staff.update(user.id, { recoveryCodes });
      recordAudit('Regenerated two-factor recovery codes', 'Security');
      return ok<RecoveryCodes>({ recoveryCodes });
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
