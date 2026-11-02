import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useT as useCommonT } from '@/lib/i18n/common';
import { Field, Input } from './Form';
import { Spinner } from './Misc';
import { Modal } from './Overlay';

interface ConfirmDialogProps {
  title: string;
  /** What will happen, naming the impact (how many schools, owners, members). */
  children: ReactNode;
  /** Text the operator types to arm the confirm button (e.g. "SUSPEND 12"). Matched case-insensitively, trimmed. */
  phrase: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disables the confirm button while the action runs. */
  pending?: boolean;
  /** `danger` (default) for actions that take something away, `primary` for ones that send or grant. */
  tone?: 'danger' | 'primary';
}

/**
 * Typed confirmation for actions that hit many schools or grant access in one go: the confirm button stays disabled
 * until the operator types `phrase`. The server still asks for the password (423 → PasswordConfirmPrompt) when it
 * wasn't entered in the last 15 minutes, so this guards against misclicks and the step-up against a hijacked session.
 */
export function ConfirmDialog({
  title,
  children,
  phrase,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
  tone = 'danger',
}: ConfirmDialogProps) {
  const tc = useCommonT();
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toLowerCase() === phrase.trim().toLowerCase();
  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (armed && !pending) onConfirm();
  };
  return (
    <Modal onClose={onCancel} label={title} width={460}>
      <h2 className="modal-title">{title}</h2>
      <div className="t-sm" style={{ margin: '6px 0 14px' }}>
        {children}
      </div>
      <form onSubmit={submit} noValidate>
        <Field label={tc('confirmDialog.typeToConfirm', { phrase })}>
          {(p) => (
            <Input {...p} data-autofocus autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          )}
        </Field>
        <div className="hstack" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn" onClick={onCancel}>
            {tc('actions.cancel')}
          </button>
          <button type="submit" className={tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'} disabled={!armed || pending}>
            {pending && <Spinner />} {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
