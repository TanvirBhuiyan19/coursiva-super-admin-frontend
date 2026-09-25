// The first screen of every session, so it is kept deliberately light: no zod / react-hook-form
// (≈120 KB) — the three rules below are validated by hand, and the server re-validates (422).
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Field, FormError, Input, Spinner } from '@/components/ui';
import { env } from '@/config/env';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useLogin, useTwoFactorChallenge } from './api';
import { validateCode, validateCredentials, type LoginErrors as Errors } from './validation';

const DEMO_ACCOUNTS = [
  ['sam@coursiva.io', 'Owner'],
  ['priya@coursiva.io', 'Admin'],
  ['lee@coursiva.io', 'Support'],
  ['omar@coursiva.io', 'Finance'],
  ['noah@coursiva.io', 'Read-only'],
] as const;

/** Field errors from a Laravel 422, limited to the fields this form shows. */
const serverErrors = (err: unknown, fields: (keyof Errors)[]): Errors | null => {
  if (!(err instanceof ApiError) || !err.isValidation) return null;
  const out: Errors = {};
  for (const f of fields) {
    const msg = err.field(f);
    if (msg) out[f] = msg;
  }
  return Object.keys(out).length ? out : null;
};

export default function LoginPage() {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const login = useLogin();
  const challenge = useTwoFactorChallenge();

  // Move focus to the first field of whichever step is showing.
  useEffect(() => {
    (step === 'password' ? emailRef : codeRef).current?.focus();
  }, [step]);

  const focusFirstError = (e: Errors) => {
    if (e.email) emailRef.current?.focus();
    else if (e.password) passwordRef.current?.focus();
    else if (e.code) codeRef.current?.focus();
  };

  const onLogin = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const e = validateCredentials(email, password);
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) {
      focusFirstError(e);
      return;
    }
    login.mutate(
      { email: email.trim(), password, remember },
      {
        // On success the session is cached and RedirectIfAuthed sends the user on.
        onSuccess: (res) => {
          if (res.twoFactorRequired) setStep('code');
        },
        onError: (err) => {
          const fe = serverErrors(err, ['email', 'password']);
          if (fe) {
            setErrors(fe);
            focusFirstError(fe);
          } else setFormError(errorMessage(err));
        },
      },
    );
  };

  const onCode = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const e = validateCode(code);
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) {
      focusFirstError(e);
      return;
    }
    challenge.mutate(code.replace(/\s/g, ''), {
      onError: (err) => {
        const fe = serverErrors(err, ['code']);
        if (fe) {
          setErrors(fe);
          focusFirstError(fe);
        } else {
          setFormError(errorMessage(err));
          setStep('password');
        }
      },
    });
  };

  const clearError = (f: keyof Errors) => errors[f] && setErrors((e) => ({ ...e, [f]: undefined }));

  return (
    <div className="auth-page">
      <main className="auth-card card" aria-labelledby="auth-title">
        <div className="hstack" style={{ gap: 10, marginBottom: 22 }}>
          <div className="sb-logo" aria-hidden="true">
            C
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Coursiva</div>
            <div className="t-xs muted">Platform console</div>
          </div>
        </div>

        {step === 'password' ? (
          <form onSubmit={onLogin} noValidate>
            <h1 id="auth-title" className="modal-title">
              Sign in
            </h1>
            <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
              Staff access only. Every session is logged.
            </p>
            <Field label="Work email" error={errors.email}>
              {(p) => (
                <Input
                  {...p}
                  ref={emailRef}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError('email');
                  }}
                  type="email"
                  size="lg"
                  autoComplete="username"
                />
              )}
            </Field>
            <Field label="Password" error={errors.password}>
              {(p) => (
                <Input
                  {...p}
                  ref={passwordRef}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError('password');
                  }}
                  type="password"
                  size="lg"
                  autoComplete="current-password"
                />
              )}
            </Field>
            <label className="hstack t-sm" style={{ marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" className="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in on this device
            </label>
            <FormError>{formError}</FormError>
            <button type="submit" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 18 }} disabled={login.isPending}>
              {login.isPending && <Spinner />} Sign in
            </button>
          </form>
        ) : (
          <form onSubmit={onCode} noValidate>
            <h1 id="auth-title" className="modal-title">
              Two-factor authentication
            </h1>
            <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <Field label="Authentication code" error={errors.code}>
              {(p) => (
                <Input
                  {...p}
                  ref={codeRef}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    clearError('code');
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  size="lg"
                  style={{ letterSpacing: '0.3em', fontWeight: 700 }}
                />
              )}
            </Field>
            <FormError>{formError}</FormError>
            <button type="submit" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 18 }} disabled={challenge.isPending}>
              {challenge.isPending && <Spinner />} Verify
            </button>
            <button type="button" className="link link--muted" style={{ marginTop: 12 }} onClick={() => setStep('password')}>
              ← Use a different account
            </button>
          </form>
        )}

        {env.enableMocks && (
          <div className="callout" style={{ marginTop: 20, display: 'block' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Demo accounts (mock API)</div>
            <div className="t-xs muted" style={{ marginBottom: 6 }}>
              Password <code>password</code> · 2FA code <code>123456</code>
            </div>
            <div className="hstack wrap" style={{ gap: 6 }}>
              {DEMO_ACCOUNTS.map(([demoEmail, role]) => (
                <button
                  key={demoEmail}
                  type="button"
                  className="chip chip--xs"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword('password');
                    setErrors({});
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
