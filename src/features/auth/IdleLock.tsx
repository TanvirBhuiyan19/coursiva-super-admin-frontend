import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Field, FormError, Input, Modal, Spinner } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useConfirmPassword, useLogout, useSession } from './api';
import { useT } from './i18n';
import { useIdleLock } from './useIdleLock';

/** Renders the idle warning and the lock screen; tells the shell when the app must be inert. */
export function IdleLock({ onLockedChange }: { onLockedChange: (locked: boolean) => void }) {
  const t = useT();
  const { data: user } = useSession();
  const { state, secondsLeft, stayActive, unlock } = useIdleLock(user?.idleLockMinutes ?? 15, !!user);

  useEffect(() => onLockedChange(state === 'locked'), [state, onLockedChange]);

  if (!user) return null;
  if (state === 'warning')
    return (
      <Modal onClose={stayActive} label={t('idle.warningLabel')} width={420}>
        <h2 className="modal-title">{t('idle.stillThere')}</h2>
        <p className="t-sm muted" style={{ margin: '6px 0 18px' }} aria-live="polite">
          {t('idle.locksIn')} <strong>{secondsLeft}</strong> {t('idle.secondsLeft', { count: secondsLeft })}
        </p>
        <button type="button" className="btn btn--primary btn--lg btn--block" data-autofocus onClick={stayActive}>
          {t('idle.staySignedIn')}
        </button>
      </Modal>
    );
  if (state === 'locked') return <LockScreen name={user.name} email={user.email} onUnlocked={unlock} />;
  return null;
}

function LockScreen({ name, email, onUnlocked }: { name: string; email: string; onUnlocked: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const confirm = useConfirmPassword();
  const logout = useLogout();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    if (!password) {
      setError(t('validation.password'));
      input.current?.focus();
      return;
    }
    confirm.mutate(password, {
      onSuccess: () => {
        setPassword('');
        onUnlocked();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.field('password')) setError(err.field('password') ?? null);
        else setFormError(errorMessage(err));
        setPassword('');
        input.current?.focus();
      },
    });
  };

  return createPortal(
    <div className="lock-screen" role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <main className="auth-card card">
        <div className="hstack" style={{ gap: 10, marginBottom: 18 }}>
          <div className="sb-logo" aria-hidden="true">
            C
          </div>
          <div className="min0">
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div className="t-xs muted ellipsis">{email}</div>
          </div>
        </div>
        <h1 id="lock-title" className="modal-title">
          {t('idle.locked')}
        </h1>
        <p className="t-sm muted" style={{ margin: '4px 0 6px' }}>
          {t('idle.lockedIntro')}
        </p>
        <form onSubmit={submit} noValidate>
          <Field label={t('idle.password')} error={error ?? undefined}>
            {(p) => (
              <Input
                {...p}
                ref={input}
                type="password"
                size="lg"
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
          <button type="submit" className="btn btn--primary btn--lg btn--block" style={{ marginTop: 18 }} disabled={confirm.isPending}>
            {confirm.isPending && <Spinner />} {t('idle.unlock')}
          </button>
        </form>
        <button
          type="button"
          className="link link--muted"
          style={{ marginTop: 14 }}
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate('/login', { replace: true }) })}
        >
          {t('idle.notYou')}
        </button>
      </main>
    </div>,
    document.body,
  );
}
