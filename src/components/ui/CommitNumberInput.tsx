import { useId, useState, type CSSProperties } from 'react';

interface Props {
  value: number;
  /** Called on blur / Enter with a valid, changed value. */
  onCommit: (next: number) => void;
  min: number;
  max: number;
  /** Accessible name. */
  label: string;
  /** Message shown when the draft is not a whole number in range. */
  rangeMessage: string;
  disabled?: boolean;
  style?: CSSProperties;
  prefix?: string;
  suffix?: string;
  /** Lets a visible `<label htmlFor>` (e.g. from `Field`) name the input. */
  id?: string;
}

/**
 * Inline number setting that saves when the operator leaves the field (or presses Enter).
 * Escape restores the saved value. Remount with `key={value}` to pick up a new server value.
 */
export function CommitNumberInput({ value, onCommit, min, max, label, rangeMessage, disabled, style, prefix, suffix, id }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const errId = useId();

  const commit = () => {
    const n = Number(draft.trim());
    if (!draft.trim() || !Number.isInteger(n) || n < min || n > max) {
      setError(rangeMessage);
      return;
    }
    setError(null);
    if (n !== value) onCommit(n);
  };

  return (
    <div className="min0">
      <div className="hstack" style={{ gap: 4 }}>
        {prefix && (
          <span className="faint" aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className="input"
          inputMode="numeric"
          style={{ padding: '7px 10px', fontSize: 12.5, width: 70, ...style }}
          value={draft}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(String(value));
              setError(null);
            }
          }}
        />
        {suffix && <span className="muted t-sm">{suffix}</span>}
      </div>
      {error && (
        <div id={errId} className="field-error" role="alert" style={{ maxWidth: 180 }}>
          {error}
        </div>
      )}
    </div>
  );
}
