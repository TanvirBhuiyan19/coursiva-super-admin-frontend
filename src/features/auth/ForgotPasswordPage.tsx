// Public: asks for a reset link (`POST /auth/forgot-password`). The answer never reveals whether the account exists.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError, Input, Spinner } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useForgotPassword } from './api';
import { AuthCard } from './AuthCard';
import { useT } from './i18n';
import { validateEmail } from './validation';

export default function ForgotPasswordPage() {
  const t = useT();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => emailRef.current?.focus(), []);

  const submit = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setFormError(null);
    const e = validateEmail(email).email;
    setError(e);
    if (e) {
      emailRef.current?.focus();
      return;
    }
    forgot.mutate(
      { email: email.trim() },
      {
        onSuccess: () => setSent(email.trim()),
        onError: (err) => {
          if (err instanceof ApiError && err.field('email')) setError(err.field('email'));
          else setFormError(errorMessage(err));
        },
      },
    );
  };

  return (
    <AuthCard>
      {sent ? (
        <div role="status">
          <h1 id="auth-title" className="modal-title">
            {t('forgot.sentTitle')}
          </h1>
          {/* Never says whether the account exists (the API answers the same either way). */}
          <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
            {t('forgot.sentBody', { email: sent })}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h1 id="auth-title" className="modal-title">
            {t('forgot.title')}
          </h1>
          <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
            {t('forgot.intro')}
          </p>
          <Field label={t('login.email')} error={error}>
            {(p) => (
              <Input
                {...p}
                ref={emailRef}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(undefined);
                }}
                type="email"
                size="lg"
                autoComplete="username"
              />
            )}
          </Field>
          <FormError>{formError}</FormError>
          <button type="submit" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 18 }} disabled={forgot.isPending}>
            {forgot.isPending && <Spinner />} {t('forgot.submit')}
          </button>
        </form>
      )}
      <Link className="link link--muted t-sm" to="/login" style={{ display: 'inline-block', marginTop: 14 }}>
        {t('forgot.backToSignIn')}
      </Link>
    </AuthCard>
  );
}
