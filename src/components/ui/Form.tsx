import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface FieldProps {
  label: ReactNode;
  /** Validation message shown under the control and linked via aria-describedby. */
  error?: string | undefined;
  hint?: ReactNode;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  style?: React.CSSProperties;
}

/** Label + control + hint/error, wired for screen readers. Render-prop gives the control its id/aria props. */
export function Field({ label, error, hint, children, style }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const hasMsg = !!error || hint != null;
  return (
    <div style={style}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, ...(error ? { 'aria-invalid': true } : {}), ...(hasMsg ? { 'aria-describedby': msgId } : {}) })}
      {error ? (
        <div id={msgId} className="field-error" role="alert">
          {error}
        </div>
      ) : hint != null ? (
        <div id={msgId} className="field-hint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

type InputProps = Omit<ComponentProps<'input'>, 'size'> & { size?: 'lg' };
export function Input({ className, size, ...rest }: InputProps) {
  return <input className={cx('input', size === 'lg' && 'input--lg', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx('textarea', className)} {...rest} />;
}

/** Form-level error banner (e.g. a failed save that isn't tied to one field). */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="callout callout--bad" role="alert" style={{ marginTop: 12 }}>
      {children}
    </div>
  );
}
