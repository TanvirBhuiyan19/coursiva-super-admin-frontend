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

export function validateCode(code: string): LoginErrors {
  return /^\d{6}$/.test(code.replace(/\s/g, '')) ? {} : { code: t('validation.code') };
}
