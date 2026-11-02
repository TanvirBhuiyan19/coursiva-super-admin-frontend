import { useState } from 'react';
import { Field, FormError, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useCancelTask, useCompleteTask } from '../api';
import { t as tStatic, useT } from '../i18n';
import type { CompleteTaskInput, RegistrarTask } from '../types';

const MAX_NOTE = 500;
/** 6–64 printable characters (the API's rule). */
const AUTH_CODE = /^[\x21-\x7E]{6,64}$/;

type Errors = Partial<Record<'note' | 'authCode' | 'expiresAt', string>>;

/** Field errors from a 422, or null for any other failure. */
function fieldErrors(err: unknown): Errors | null {
  if (!(err instanceof ApiError) || !err.isValidation) return null;
  const out: Errors = {};
  for (const key of ['note', 'authCode', 'expiresAt'] as const) {
    const msg = err.field(key);
    if (msg) out[key] = msg;
  }
  return Object.keys(out).length ? out : null;
}

/** Complete / Cancel for an open task — only for staff with `tenants.manage`. */
export function TaskActions({ task }: { task: RegistrarTask }) {
  const t = useT();
  const can = useCan();
  const [open, setOpen] = useState<'complete' | 'cancel' | null>(null);
  if (task.status !== 'open' || !can('tenants.manage')) return null;
  const kind = t(`taskKind.${task.kind}`);
  return (
    <div className="hstack" style={{ gap: 8 }}>
      <button
        type="button"
        className="btn btn--sm btn--primary"
        onClick={() => setOpen('complete')}
        aria-label={t('tasks.completeLabel', { kind, domain: task.domain })}
      >
        {t('tasks.complete')}
      </button>
      <button
        type="button"
        className="btn btn--sm"
        onClick={() => setOpen('cancel')}
        aria-label={t('tasks.cancelLabel', { kind, domain: task.domain })}
      >
        {t('tasks.cancel')}
      </button>
      {open === 'complete' && <CompleteTaskModal task={task} onClose={() => setOpen(null)} />}
      {open === 'cancel' && <CancelTaskModal task={task} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CompleteTaskModal({ task, onClose }: { task: RegistrarTask; onClose: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const complete = useCompleteTask();
  const [note, setNote] = useState('');
  // The transfer code lives only in this field until it is sent; it is never put in the URL, cache or storage.
  const [authCode, setAuthCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const transfer = task.kind === 'transfer_out';
  const kind = t(`taskKind.${task.kind}`);

  const submit = () => {
    const local: Errors = {};
    if (note.trim().length > MAX_NOTE) local.note = tStatic('complete.noteTooLong');
    if (transfer && !AUTH_CODE.test(authCode)) local.authCode = tStatic('complete.authCodeRequired');
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    const input: CompleteTaskInput = {
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(transfer ? { authCode } : {}),
      ...(task.kind === 'renew' && expiresAt ? { expiresAt } : {}),
    };
    complete.mutate(
      { id: task.id, input },
      {
        onSuccess: () => {
          setAuthCode('');
          toast(
            transfer
              ? tStatic('toasts.transferSent', { tenant: task.tenantName, domain: task.domain })
              : tStatic('toasts.completed', { kind, domain: task.domain }),
          );
          onClose();
        },
        onError: (err) => {
          // Drop the failed request (and the code in its variables) from the mutation cache; the field keeps it.
          complete.reset();
          const fields = fieldErrors(err);
          if (fields) setErrors(fields);
          else setFormError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Modal onClose={onClose} label={t('complete.title', { kind, domain: task.domain })} width={520}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <h2 className="modal-title">{t('complete.title', { kind, domain: task.domain })}</h2>
        <p className="t-sm muted" style={{ margin: '6px 0 14px', lineHeight: 1.5 }}>
          {task.instructions}
        </p>
        <div className="stack" style={{ gap: 12 }}>
          {transfer && (
            <Field label={t('complete.authCode')} error={errors.authCode} hint={t('complete.authCodeHint', { tenant: task.tenantName })}>
              {(p) => (
                <Input
                  {...p}
                  type="password"
                  // "new-password": browsers ignore "off" here and fill in the saved login.
                  autoComplete="new-password"
                  data-bwignore
                  spellCheck={false}
                  data-1p-ignore=""
                  data-lpignore="true"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  maxLength={64}
                  data-autofocus=""
                />
              )}
            </Field>
          )}
          {task.kind === 'renew' && (
            <Field label={t('complete.expiresAt')} error={errors.expiresAt} hint={t('complete.expiresAtHint')}>
              {(p) => <Input {...p} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}
            </Field>
          )}
          <Field label={t('complete.note')} error={errors.note} hint={t('complete.noteHint')}>
            {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn" onClick={onClose}>
            {tc('actions.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={complete.isPending}>
            {complete.isPending && <Spinner />} {transfer ? t('complete.submitTransfer') : t('complete.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelTaskModal({ task, onClose }: { task: RegistrarTask; onClose: () => void }) {
  const t = useT();
  const cancel = useCancelTask();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const refunds = task.kind === 'registration_review';
  const kind = t(`taskKind.${task.kind}`);

  const submit = () => {
    if (note.trim().length > MAX_NOTE) {
      setError(tStatic('complete.noteTooLong'));
      return;
    }
    setError(null);
    setFormError(null);
    cancel.mutate(
      { id: task.id, input: note.trim() ? { note: note.trim() } : {} },
      {
        onSuccess: () => {
          toast(
            refunds
              ? tStatic('toasts.cancelledRefund', { domain: task.domain })
              : tStatic('toasts.cancelled', { kind, domain: task.domain }),
          );
          onClose();
        },
        onError: (err) => {
          const fields = fieldErrors(err);
          if (fields?.note) setError(fields.note);
          else setFormError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Modal onClose={onClose} label={t('cancel.title', { kind, domain: task.domain })} width={480}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <h2 className="modal-title">{t('cancel.title', { kind, domain: task.domain })}</h2>
        {refunds ? (
          <div className="callout callout--warn" style={{ margin: '10px 0 14px' }}>
            {t('cancel.refund')}
          </div>
        ) : (
          <p className="t-sm muted" style={{ margin: '6px 0 14px' }}>
            {t('cancel.body')}
          </p>
        )}
        <Field label={t('cancel.note')} error={error ?? undefined}>
          {(p) => <Textarea {...p} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel.keep')}
          </button>
          <button type="submit" className="btn btn--danger" disabled={cancel.isPending}>
            {cancel.isPending && <Spinner />} {refunds ? t('cancel.submitRefund') : t('cancel.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
