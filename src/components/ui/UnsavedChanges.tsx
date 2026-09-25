import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal } from './Overlay';

/**
 * Guards a form with unsaved edits: asks before in-app navigation (React Router blocker)
 * and before closing or reloading the tab (beforeunload).
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  if (blocker.state !== 'blocked') return null;
  return (
    <Modal onClose={() => blocker.reset()} label="Unsaved changes" width={420}>
      <h2 className="modal-title">Leave without saving?</h2>
      <p className="t-sm muted" style={{ margin: '6px 0 18px' }}>
        You have changes on this page that haven’t been saved. They’ll be lost if you leave.
      </p>
      <div className="hstack" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn--lg" data-autofocus onClick={() => blocker.reset()}>
          Keep editing
        </button>
        <button type="button" className="btn btn--danger btn--lg" onClick={() => blocker.proceed()}>
          Discard and leave
        </button>
      </div>
    </Modal>
  );
}
