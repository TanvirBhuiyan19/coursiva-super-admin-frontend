import { useId, useState, type CSSProperties } from 'react';
import { Spinner, Textarea } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useImpersonate } from '../api';
import { useT } from '../i18n';
import type { Impersonation } from '../types';

interface Props {
  tenantId: string;
  /** Visible label of the trigger button. */
  label: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * "Sign in as owner": asks for the reason first (recorded in the audit log). The platform setting
 * `impersonation_requires_reason` decides whether it's required — the API answers 422 `reason` when it is.
 */
export function ImpersonateAction({ tenantId, label, className = 'btn', style }: Props) {
  const t = useT();
  const tc = useCommonT();
  const id = useId();
  const impersonate = useImpersonate(tenantId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The signed handoff link of the last session started, kept as a fallback when the browser blocks the new tab.
  const [session, setSession] = useState<Impersonation | null>(null);

  if (!open)
    return (
      <div className="stack" style={{ gap: 6, flex: style?.flex, minWidth: 0 }}>
        <button
          type="button"
          className={className}
          style={style}
          onClick={() => {
            setSession(null);
            setOpen(true);
          }}
        >
          {label}
        </button>
        {session && (
          <p className="t-xs muted" role="status" style={{ margin: 0 }}>
            {t('impersonate.opened')}{' '}
            <a href={session.url} target="_blank" rel="noopener noreferrer">
              {t('impersonate.openAgain')}
            </a>
          </p>
        )}
      </div>
    );

  const start = () => {
    const r = reason.trim();
    if (r && (r.length < 5 || r.length > 300)) {
      setError(t('impersonate.invalid'));
      return;
    }
    setError(null);
    impersonate.mutate(r ? { reason: r } : {}, {
      // The tenant dashboard opens in its own tab on the signed, short-lived handoff link; it shows the
      // read-only banner and the exit control. The console keeps the link in case a pop-up blocker stops the tab.
      onSuccess: (data) => {
        setOpen(false);
        setReason('');
        setSession(data);
        window.open(data.url, '_blank', 'noopener,noreferrer');
      },
      onError: (err) => setError(err instanceof ApiError ? (err.field('reason') ?? err.message) : errorMessage(err)),
    });
  };

  return (
    <div className="stack" style={{ gap: 8, flex: '1 1 100%', minWidth: 0 }}>
      <label className="field-label" htmlFor={id} style={{ margin: 0 }}>
        {t('impersonate.reason')}
      </label>
      <Textarea
        id={id}
        rows={2}
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-msg`}
        // Opening the form is an explicit request to type the reason.
        // eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the user's click on "Sign in as owner"
        autoFocus
      />
      {error ? (
        <div id={`${id}-msg`} className="field-error" role="alert">
          {error}
        </div>
      ) : (
        <div id={`${id}-msg`} className="field-hint">
          {t('impersonate.hint')}
        </div>
      )}
      <div className="hstack wrap" style={{ gap: 8 }}>
        <button type="button" className="btn btn--primary" disabled={impersonate.isPending} onClick={start}>
          {impersonate.isPending && <Spinner />} {t('impersonate.start')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={impersonate.isPending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {tc('actions.cancel')}
        </button>
      </div>
    </div>
  );
}
