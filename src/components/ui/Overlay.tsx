import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour: Escape closes, Tab is trapped inside the panel, the page behind stops scrolling,
 * initial focus goes to the first field (or [data-autofocus]) and returns to the trigger on close.
 */
function useOverlay(onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const target = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, select, textarea') ?? el;
    target?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus({ preventScroll: true });
    };
  }, []);
  return panel;
}

interface OverlayProps {
  onClose: () => void;
  children: ReactNode;
  /** Accessible name for the dialog. */
  label: string;
  width?: number;
}

export function Modal({ onClose, width = 460, children, label, top }: OverlayProps & { top?: boolean }) {
  const panel = useOverlay(onClose);
  return createPortal(
    // Backdrop click closes; keyboard users close with Escape (handled in useOverlay).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={top ? 'scrim scrim--top' : 'scrim scrim--center'} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={label} style={{ width }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ onClose, width = 400, children, label }: OverlayProps) {
  const panel = useOverlay(onClose);
  return createPortal(
    // Backdrop click closes; keyboard users close with Escape (handled in useOverlay).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="scrim scrim--right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={label} style={{ width }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
