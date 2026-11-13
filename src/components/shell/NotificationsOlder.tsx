import { useState } from 'react';
import { useOlderNotifications } from '@/features/shell/api';
import { useT } from '@/features/shell/i18n';
import { errorMessage } from '@/lib/api/errors';
import { Spinner } from '../ui/Misc';
import { NotificationRow } from './NotificationRow';

/**
 * "Load older" at the bottom of the notifications panel: appends older pages after the bell's first page (`cursor` =
 * its `next_cursor`). Lazily loaded — the bell itself only ever reads the first page.
 */
export default function NotificationsOlder({ cursor, onPick }: { cursor: string; onPick: () => void }) {
  const t = useT();
  const [started, setStarted] = useState(false);
  const q = useOlderNotifications(cursor, started);
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const more = !started || q.isPending || q.isError || q.hasNextPage;
  const pending = started && q.isFetching;
  const failed = q.isFetchNextPageError || q.isRefetchError || (q.isError && !q.data);

  const load = () => {
    if (!started) setStarted(true);
    else if (!q.data) void q.refetch();
    else void q.fetchNextPage();
  };

  return (
    <>
      {rows.map((n) => (
        <NotificationRow key={n.id} n={n} onPick={onPick} />
      ))}
      {more && (
        <div className="stack" style={{ gap: 6, alignItems: 'center', padding: '10px 15px' }}>
          <button type="button" className="btn btn--sm btn--ghost" disabled={pending} onClick={load}>
            {pending ? (
              <>
                <Spinner /> {t('notifications.loadingOlder')}
              </>
            ) : (
              t('notifications.loadOlder')
            )}
          </button>
          {failed && !pending && (
            <p className="field-error" role="alert" style={{ margin: 0 }}>
              {t('notifications.olderFailed', { error: errorMessage(q.error) })}
            </p>
          )}
        </div>
      )}
    </>
  );
}
