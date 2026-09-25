import { useT } from '@/features/shell/i18n';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUi } from '@/store/ui';

export default function Toasts() {
  const t = useT();
  const tc = useCommonT();
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="toasts" role="region" aria-label={t('toasts.label')}>
      <div aria-live="polite" className="stack" style={{ gap: 8, alignItems: 'center' }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={'toast' + (toast.tone === 'error' ? ' toast--error' : '')}
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{toast.message}</span>
            <button type="button" className="toast-x" aria-label={tc('actions.dismiss')} onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
