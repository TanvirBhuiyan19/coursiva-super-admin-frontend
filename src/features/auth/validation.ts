// Hand-written validation for the login flow (kept out of zod so the login chunk stays small).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginErrors = Partial<Record<'email' | 'password' | 'code', string>>;

export function validateCredentials(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export function validateCode(code: string): LoginErrors {
  return /^\d{6}$/.test(code.replace(/\s/g, '')) ? {} : { code: 'Enter the 6-digit code from your authenticator app.' };
}
