import { useState, type SyntheticEvent } from 'react';
import { Badge, Card, ConfirmButton, Field, FormError, Input, Spinner } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { toast } from '@/store/ui';
import { useConfirmTwoFactor, useDisableTwoFactor, useEnableTwoFactor, useRegenerateRecoveryCodes } from '../api';
import { useT } from '../i18n';
import type { TwoFactorSetup, User } from '../types';
import { QrCode } from './QrCode';

/**
 * Two-step enrolment (Laravel StaffCredentials): `POST /auth/two-factor` stores an unconfirmed secret; 2FA only takes
 * effect once a code from the app is verified (`POST /auth/two-factor/confirm`), which returns the recovery codes once.
 * Starting, disabling and new codes need a recent password (423 → the shell's password prompt, then a retry).
 */
export function TwoFactorCard({ user }: { user: User }) {
  const t = useT();
  const enable = useEnableTwoFactor();
  const confirm = useConfirmTwoFactor();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const start = () => {
    setFormError(null);
    enable.mutate(undefined, { onSuccess: setSetup });
  };

  const submit = (ev: SyntheticEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setFormError(null);
    if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) {
      setCodeError(t('validation.code'));
      return;
    }
    confirm.mutate(code.replace(/\s/g, ''), {
      onSuccess: (res) => {
        setSetup(null);
        setCode('');
        setCodes(res.recoveryCodes);
        toast(t('account.twoFactor.enabled'));
      },
      onError: (err) => {
        if (err instanceof ApiError && err.field('code')) setCodeError(err.field('code'));
        else setFormError(errorMessage(err));
      },
    });
  };

  const copy = () => {
    if (!codes) return;
    void navigator.clipboard.writeText(codes.join('\n')).then(
      () => toast(t('account.twoFactor.copied')),
      () => undefined,
    );
  };

  return (
    <Card
      title={t('account.twoFactor.title')}
      right={
        <Badge tone={user.twoFactorEnabled ? 'good' : 'warn'} pill>
          {t(user.twoFactorEnabled ? 'account.twoFactor.on' : 'account.twoFactor.off')}
        </Badge>
      }
    >
      {codes ? (
        <div className="stack" style={{ gap: 10 }} role="status">
          <h3 className="t-sm" style={{ margin: 0, fontWeight: 700 }}>
            {t('account.twoFactor.codesTitle')}
          </h3>
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('account.twoFactor.codesIntro')}
          </p>
          <ul className="plain-list mono" style={{ columns: 2, maxWidth: 320 }} aria-label={t('account.twoFactor.codesTitle')}>
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <div className="hstack wrap" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={copy}>
              {t('account.twoFactor.copy')}
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setCodes(null)}>
              {t('account.twoFactor.done')}
            </button>
          </div>
        </div>
      ) : setup ? (
        <form onSubmit={submit} noValidate className="stack" style={{ gap: 12 }}>
          <p className="t-sm" style={{ margin: 0 }}>
            {t('account.twoFactor.scan')}
          </p>
          <QrCode value={setup.otpauthUrl} label={t('account.twoFactor.qrLabel')} />
          <p className="t-xs muted" style={{ margin: 0 }}>
            {t('account.twoFactor.manual')} <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code>
          </p>
          <Field label={t('account.twoFactor.code')} error={codeError} style={{ maxWidth: 240 }}>
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(undefined);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
              />
            )}
          </Field>
          <FormError>{formError}</FormError>
          <div className="hstack wrap" style={{ gap: 8 }}>
            <button type="submit" className="btn btn--primary" disabled={confirm.isPending}>
              {confirm.isPending && <Spinner />} {t('account.twoFactor.confirm')}
            </button>
            <button type="button" className="btn" disabled={confirm.isPending} onClick={() => setSetup(null)}>
              {t('account.twoFactor.cancel')}
            </button>
          </div>
        </form>
      ) : user.twoFactorEnabled ? (
        <div className="stack" style={{ gap: 12 }}>
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('account.twoFactor.onIntro')}
          </p>
          <div className="hstack wrap" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={regenerate.isPending}
              onClick={() =>
                regenerate.mutate(undefined, {
                  onSuccess: (res) => {
                    setCodes(res.recoveryCodes);
                    toast(t('account.twoFactor.regenerated'));
                  },
                })
              }
            >
              {regenerate.isPending && <Spinner />} {t('account.twoFactor.regenerate')}
            </button>
            {/* While the platform requires 2FA, turning it off sends this member straight back to set it up again. */}
            <ConfirmButton
              confirmLabel={t('account.twoFactor.confirmDisable')}
              pending={disable.isPending}
              onConfirm={() => disable.mutate(undefined, { onSuccess: () => toast(t('account.twoFactor.disabled')) })}
            >
              {t('account.twoFactor.disable')}
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <p className="t-sm muted" style={{ margin: 0 }}>
            {t('account.twoFactor.offIntro')}
          </p>
          <FormError>{formError}</FormError>
          <div>
            <button type="button" className="btn btn--primary" disabled={enable.isPending} onClick={start}>
              {enable.isPending && <Spinner />} {t('account.twoFactor.enable')}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
