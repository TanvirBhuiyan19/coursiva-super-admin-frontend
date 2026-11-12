import { useId, useState, type KeyboardEvent } from 'react';
import { useT as useCommonT } from '@/lib/i18n/common';
import { Spinner } from './Misc';

export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
}

interface SearchPickerProps {
  /** Accessible name of the search box (the visible label, when there is one, is the caller's). */
  label: string;
  query: string;
  onQueryChange: (q: string) => void;
  /** The server's matches for `query` (one page — the caller searches server-side). */
  options: readonly PickerOption[];
  onPick: (option: PickerOption) => void;
  loading?: boolean;
  /** Shown instead of the options when the search failed. */
  error?: string | null;
  /** Marks options already chosen (multi-select pickers): announced as selected, picking them again is the caller's call. */
  isChosen?: (value: string) => boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  width?: number | string;
}

/**
 * Search-as-you-type picker over a server-side list (an ARIA combobox: focus stays in the box, options are announced
 * via aria-activedescendant). The caller owns the query and fetches the matches, so lists of any size stay pickable.
 */
export function SearchPicker({
  label,
  query,
  onQueryChange,
  options,
  onPick,
  loading,
  error,
  isChosen,
  placeholder,
  disabled,
  id,
  width = '100%',
}: SearchPickerProps) {
  const tc = useCommonT();
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const optionId = (i: number) => `${uid}-opt-${String(i)}`;
  const shown = open && !disabled;
  const current = Math.min(active, Math.max(options.length - 1, 0));

  const pick = (o: PickerOption) => {
    onPick(o);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((current + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter' && shown && options[current]) {
      e.preventDefault();
      pick(options[current]);
    } else if (e.key === 'Escape' && shown) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', width }}>
      <input
        id={id}
        type="search"
        className="input"
        role="combobox"
        aria-label={label}
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && options.length ? optionId(current) : undefined}
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        className="card card--inset"
        hidden={!shown}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 4,
          zIndex: 30,
          maxHeight: 240,
          overflowY: 'auto',
          padding: 4,
        }}
      >
        {loading && options.length === 0 ? (
          <div className="hstack t-sm muted" style={{ padding: '8px 10px', gap: 8 }}>
            <Spinner /> {tc('states.loading')}
          </div>
        ) : error ? (
          <div className="t-sm fg-bad" style={{ padding: '8px 10px' }}>
            {error}
          </div>
        ) : options.length === 0 ? (
          <div className="t-sm muted" style={{ padding: '8px 10px' }}>
            {tc('states.noResults')}
          </div>
        ) : (
          options.map((o, i) => {
            const on = i === current;
            return (
              // Focus stays in the box; keys move `aria-activedescendant` (see onKeyDown).
              // eslint-disable-next-line jsx-a11y/interactive-supports-focus
              <div
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={isChosen ? isChosen(o.value) : on}
                className={'cmdk-item' + (on ? ' is-on' : '')}
                style={{ padding: '7px 10px' }}
                // mousedown, not click: the box's blur would close the list before a click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="min0" style={{ flex: 1 }}>
                  <span className="ellipsis" style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                    {o.label}
                  </span>
                  {o.sub && (
                    <span className="ellipsis faint" style={{ display: 'block', fontSize: 11.5 }}>
                      {o.sub}
                    </span>
                  )}
                </span>
                {isChosen?.(o.value) && (
                  <span aria-hidden="true" className="fg-accent">
                    ✓
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
