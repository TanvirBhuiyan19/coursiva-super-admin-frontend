// Hand-written validation for the login flow (kept out of zod so the login chunk stays small).
import { t } from './i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginErrors = Partial<Record<'email' | 'password' | 'code', string>>;

export function validateCredentials(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = t('validation.email');
  if (!password) errors.password = t('validation.password');
  return errors;
}

/** A 6-digit TOTP code, or a single-use recovery code (`xxxxx-xxxxx`) — the API accepts both. */
export function validateCode(code: string): LoginErrors {
  const c = code.replace(/\s/g, '');
  return /^\d{6}$/.test(c) || /^[a-z0-9]{5}-[a-z0-9]{5}$/i.test(c) ? {} : { code: t('validation.code') };
}

export type PasswordErrors = Partial<Record<'currentPassword' | 'password' | 'passwordConfirmation', string>>;

/** New-password rules the API enforces everywhere (min 8 outside production; production adds strength checks → 422). */
export function validateNewPassword(password: string, confirmation: string): PasswordErrors {
  const errors: PasswordErrors = {};
  if (password.length < 8) errors.password = t('validation.passwordMin');
  else if (password !== confirmation) errors.passwordConfirmation = t('validation.passwordMatch');
  return errors;
}

export const validateEmail = (email: string): LoginErrors => (EMAIL_RE.test(email.trim()) ? {} : { email: t('validation.email') });
