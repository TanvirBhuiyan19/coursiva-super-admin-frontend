import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { useT as useCommonT } from '@/lib/i18n/common';
import { Modal } from './Overlay';

/**
 * Guards a form with unsaved edits: asks before in-app navigation (React Router blocker)
 * and before closing or reloading the tab (beforeunload).
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const tc = useCommonT();
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
    <Modal onClose={() => blocker.reset()} label={tc('unsaved.label')} width={420}>
      <h2 className="modal-title">{tc('unsaved.title')}</h2>
      <p className="t-sm muted" style={{ margin: '6px 0 18px' }}>
        {tc('unsaved.body')}
      </p>
      <div className="hstack" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" className="btn btn--lg" data-autofocus onClick={() => blocker.reset()}>
          {tc('unsaved.keepEditing')}
        </button>
        <button type="button" className="btn btn--danger btn--lg" onClick={() => blocker.proceed()}>
          {tc('unsaved.discard')}
        </button>
      </div>
    </Modal>
  );
}
