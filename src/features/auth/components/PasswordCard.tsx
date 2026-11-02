import { useRef, useState, type SyntheticEvent } from 'react';
import { Card, Field, FormError, Input, Spinner } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { toast } from '@/store/ui';
import { useChangePassword } from '../api';
import { useT } from '../i18n';
import { validateNewPassword, type PasswordErrors } from '../validation';

/** `PUT /auth/password`: other sessions of this member end; this one stays signed in. */
export function PasswordCard() {
  const t = useT();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = {
    currentPassword: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    passwordConfirmation: useRef<HTMLInputElement>(null),
  };

  const focusFirst = (e: PasswordErrors) => {
    const first = (['currentPassword', 'password', 'passwordConfirmation'] as const).find((k) => e[k]);
    if (first) refs[first].current?.focus();
  };

  const submit = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setFormError(null);
    const e: PasswordErrors = {
      ...(current ? {} : { currentPassword: t('validation.currentPassword') }),
      ...validateNewPassword(password, confirmation),
    };
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirst(e);
      return;
    }
    change.mutate(
      { currentPassword: current, password, passwordConfirmation: confirmation },
      {
        onSuccess: () => {
          setCurrent('');
          setPassword('');
          setConfirmation('');
          toast(t('account.password.changed'));
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isValidation) {
            const fe: PasswordErrors = { currentPassword: err.field('currentPassword'), password: err.field('password') };
            setErrors(fe);
            focusFirst(fe);
          } else setFormError(errorMessage(err));
        },
      },
    );
  };

  // Field's render prop: label/error wiring (`id`, `aria-*`) plus this field's value, ref and autocomplete hint.
  const input = (key: keyof PasswordErrors, value: string, set: (v: string) => void, autoComplete: string) => (p: { id: string }) => (
    <Input
      {...p}
      ref={refs[key]}
      value={value}
      onChange={(e) => {
        set(e.target.value);
        setErrors((x) => ({ ...x, [key]: undefined }));
      }}
      type="password"
      autoComplete={autoComplete}
    />
  );

  const currentInput = input('currentPassword', current, setCurrent, 'current-password');
  const passwordInput = input('password', password, setPassword, 'new-password');
  const confirmationInput = input('passwordConfirmation', confirmation, setConfirmation, 'new-password');

  return (
    <Card title={t('account.password.title')}>
      <form onSubmit={submit} noValidate className="stack" style={{ gap: 4, maxWidth: 420 }}>
        <p className="t-sm muted" style={{ margin: 0 }}>
          {t('account.password.intro')}
        </p>
        <Field label={t('account.password.current')} error={errors.currentPassword}>
          {currentInput}
        </Field>
        <Field label={t('account.password.next')} error={errors.password}>
          {passwordInput}
        </Field>
        <Field label={t('account.password.confirm')} error={errors.passwordConfirmation}>
          {confirmationInput}
        </Field>
        <FormError>{formError}</FormError>
        <div style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={change.isPending}>
            {change.isPending && <Spinner />} {t('account.password.submit')}
          </button>
        </div>
      </form>
    </Card>
  );
}
