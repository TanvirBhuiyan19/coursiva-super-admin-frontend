import { useRef, useState, type SyntheticEvent } from 'react';
import { Field, FormError, Input } from '@/components/ui/Form';
import { Spinner } from '@/components/ui/Misc';
import { Modal } from '@/components/ui/Overlay';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useConfirmPassword } from './api';
import { useT } from './i18n';

/** The step-up dialog (lazy: PasswordConfirmPrompt loads it when the browser is idle, off the first paint). */
export default function PromptDialog({ onConfirmed, onCancel }: { onConfirmed: () => void; onCancel: () => void }) {
  const t = useT();
  const confirm = useConfirmPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    if (!password) {
      setError(t('validation.password'));
      input.current?.focus();
      return;
    }
    confirm.mutate(password, {
      onSuccess: onConfirmed,
      onError: (err) => {
        if (err instanceof ApiError && err.field('password')) setError(err.field('password') ?? null);
        else setFormError(errorMessage(err));
        setPassword('');
        input.current?.focus();
      },
    });
  };

  return (
    <Modal onClose={onCancel} label={t('stepUp.title')} width={420}>
      <h2 className="modal-title">{t('stepUp.title')}</h2>
      <p className="t-sm muted" style={{ margin: '4px 0 10px' }}>
        {t('stepUp.intro')}
      </p>
      <form onSubmit={submit} noValidate>
        <Field label={t('idle.password')} error={error ?? undefined}>
          {(p) => (
            <Input
              {...p}
              ref={input}
              data-autofocus
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onCancel}>
            {t('stepUp.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={confirm.isPending}>
            {confirm.isPending && <Spinner />} {t('stepUp.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
