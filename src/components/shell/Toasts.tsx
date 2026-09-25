import { useUi } from '@/store/ui';

export default function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="toasts" role="region" aria-label="Notifications">
      <div aria-live="polite" className="stack" style={{ gap: 8, alignItems: 'center' }}>
        {toasts.map((t) => (
          <div key={t.id} className={'toast' + (t.tone === 'error' ? ' toast--error' : '')} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
