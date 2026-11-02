// Public: `/reset-password?token&email[&invite=1]` — the link from a password-reset email or a staff invitation.
// Setting the password proves the mailbox; for an invited member it also activates the account (`POST /auth/reset-password`).
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Field, FormError, Input, Spinner } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useResetPassword } from './api';
import { AuthCard } from './AuthCard';
import { useT } from './i18n';
import { validateNewPassword, type PasswordErrors } from './validation';

export default function ResetPasswordPage() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const invite = params.get('invite') === '1';
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => passwordRef.current?.focus(), []);

  if (!token || !email)
    return (
      <AuthCard>
        <h1 id="auth-title" className="modal-title">
          {t(invite ? 'reset.inviteTitle' : 'reset.title')}
        </h1>
        <p className="t-sm muted" role="alert" style={{ margin: '4px 0 14px' }}>
          {t('reset.incomplete')}
        </p>
        <Link className="btn btn--primary btn--block" to="/forgot-password">
          {t('reset.requestNew')}
        </Link>
      </AuthCard>
    );

  if (reset.isSuccess)
    return (
      <AuthCard>
        <div role="status">
          <h1 id="auth-title" className="modal-title">
            {t('reset.doneTitle')}
          </h1>
        </div>
        <Link className="btn btn--primary btn--lg btn--block" to="/login" state={{ email }} style={{ marginTop: 18 }}>
          {t('reset.signIn')}
        </Link>
      </AuthCard>
    );

  const submit = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setFormError(null);
    const e = validateNewPassword(password, confirmation);
    setErrors(e);
    if (e.password || e.passwordConfirmation) {
      (e.password ? passwordRef : confirmRef).current?.focus();
      return;
    }
    reset.mutate(
      { email, token, password, passwordConfirmation: confirmation },
      {
        onError: (err) => {
          // `token` (invalid/expired link) and `email` aren't fields on this form: show them above the button.
          if (err instanceof ApiError && err.field('password')) {
            setErrors({ password: err.field('password') });
            passwordRef.current?.focus();
          } else setFormError(err instanceof ApiError ? (err.field('token') ?? err.field('email') ?? err.message) : errorMessage(err));
        },
      },
    );
  };

  return (
    <AuthCard>
      <form onSubmit={submit} noValidate>
        <h1 id="auth-title" className="modal-title">
          {t(invite ? 'reset.inviteTitle' : 'reset.title')}
        </h1>
        <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
          {t(invite ? 'reset.inviteIntro' : 'reset.intro')}
        </p>
        <Field label={t('reset.email')}>{(p) => <Input {...p} value={email} readOnly size="lg" autoComplete="username" />}</Field>
        <Field label={t('reset.password')} error={errors.password}>
          {(p) => (
            <Input
              {...p}
              ref={passwordRef}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors({});
              }}
              type="password"
              size="lg"
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field label={t('reset.confirm')} error={errors.passwordConfirmation}>
          {(p) => (
            <Input
              {...p}
              ref={confirmRef}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setErrors({});
              }}
              type="password"
              size="lg"
              autoComplete="new-password"
            />
          )}
        </Field>
        <FormError>{formError}</FormError>
        <button type="submit" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 18 }} disabled={reset.isPending}>
          {reset.isPending && <Spinner />} {t(invite ? 'reset.inviteSubmit' : 'reset.submit')}
        </button>
      </form>
      <Link className="link link--muted t-sm" to="/login" style={{ display: 'inline-block', marginTop: 14 }}>
        {t('forgot.backToSignIn')}
      </Link>
    </AuthCard>
  );
}
