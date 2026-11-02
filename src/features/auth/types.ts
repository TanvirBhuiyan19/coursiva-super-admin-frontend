import type { Permission, Role } from './permissions';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  /**
   * The platform requires staff 2FA (`require_staff_two_factor`) and this member has none: every route but `auth/*`
   * answers 403 `two_factor_setup_required` until they enrol, so the console keeps them on Account → Security.
   */
  twoFactorSetupRequired: boolean;
  permissions: Permission[];
  /** Minutes without activity before the console locks (platform policy). */
  idleLockMinutes: number;
}

/** `POST /auth/forgot-password` body. Always answers `{ sent: true }` (no account enumeration). */
export interface ForgotPasswordInput {
  email: string;
}

/** `POST /auth/reset-password` body — also accepts a staff invitation (the invite link carries `invite=1`). */
export interface ResetPasswordInput {
  email: string;
  token: string;
  password: string;
  passwordConfirmation: string;
}

/** `PUT /auth/password` body (signed in). Other sessions of this member end; this one stays signed in. */
export interface ChangePasswordInput {
  currentPassword: string;
  password: string;
  passwordConfirmation: string;
}

/** `POST /auth/two-factor` → the unconfirmed TOTP secret, shown as a QR code and as text. */
export interface TwoFactorSetup {
  secret: string;
  /** `otpauth://totp/…` URI for authenticator apps. */
  otpauthUrl: string;
}

/** Recovery codes, shown once (`POST /auth/two-factor/confirm`, `POST /auth/two-factor/recovery-codes`). */
export interface RecoveryCodes {
  recoveryCodes: string[];
}

/** `{ sent: true }` from forgot-password. */
export interface PasswordResetSent {
  sent: boolean;
}

/** `{ reset: true }` from reset-password. */
export interface PasswordResetDone {
  reset: boolean;
}

/** `{ updated: true }` from change-password. */
export interface PasswordUpdated {
  updated: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  remember: boolean;
}

export interface LoginResult {
  /** True when the account has 2FA and the code step is still required. */
  twoFactorRequired: boolean;
  user: User | null;
}

/** Public platform branding (`GET /platform/branding`) — no sign-in needed, so the sign-in screen can use it too. */
export interface Branding {
  /** The platform name (`platform_name` setting). */
  name: string;
  /** Absolute URLs of the uploaded brand images, or null when not uploaded. */
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
}
