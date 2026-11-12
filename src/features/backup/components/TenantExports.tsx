import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Empty, ErrorState, Pagination, Select, SkeletonRows, Spinner, Toggle } from '@/components/ui';
import { SearchPicker } from '@/components/ui/SearchPicker';
import { useCan } from '@/features/auth/useCan';
import { useTenantSearch } from '@/features/tenants/api';
import { ApiError } from '@/lib/api/errors';
import { timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useExportDownload, useQueueExport, useTenantExport, useTenantExports } from '../api';
import { useT } from '../i18n';
import { EXPORT_FORMATS, type ExportFormat, type TenantExport } from '../types';

/** One export's line: status, format, when and by whom. */
function JobLine({ job }: { job: TenantExport }) {
  const t = useT();
  return (
    <span className="t-xs faint">
      {t('exports.jobLine', {
        status: t(`enums.exportStatus.${job.status}`),
        format: t(`enums.exportFormat.${job.format}`),
        when: timeAgo(job.requestedAt),
        name: job.requestedByName,
      })}
    </span>
  );
}

/**
 * Pick any school by searching (server-side, so every school is reachable however many there are), see its latest
 * export (`GET /backup/exports?tenant=&per_page=1`) and queue a new one.
 */
function ExportPicker({ format, includeMedia }: { format: ExportFormat; includeMedia: boolean }) {
  const t = useT();
  const can = useCan();
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const matches = useTenantSearch(search);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const latestQ = useTenantExports({ page: 1, tenant: picked?.id, perPage: 1 }, !!picked);
  const queue = useQueueExport();
  const job = latestQ.data?.data[0];

  return (
    <div style={{ marginTop: 12 }}>
      <SearchPicker
        label={t('exports.findTenant')}
        placeholder={t('exports.searchPlaceholder')}
        query={query}
        onQueryChange={setQuery}
        options={(matches.data?.data ?? []).map((tn) => ({ value: tn.id, label: tn.name, sub: tn.domain }))}
        loading={matches.isFetching}
        error={matches.isError ? t('exports.searchFailed') : null}
        onPick={(o) => {
          setPicked({ id: o.value, name: o.label });
          setQuery('');
        }}
      />
      {picked && (
        <section className="row" aria-label={t('exports.picked')} style={{ padding: '10px 0' }}>
          <span className="min0" style={{ flex: 1 }}>
            <span className="ellipsis" style={{ fontWeight: 600, display: 'block' }}>
              {picked.name}
            </span>
            {latestQ.isPending ? (
              <Spinner />
            ) : latestQ.isError ? (
              <ErrorState compact error={latestQ.error} onRetry={() => void latestQ.refetch()} />
            ) : job ? (
              <JobLine job={job} />
            ) : (
              <span className="t-xs faint">{t('exports.noExportYet')}</span>
            )}
          </span>
          {job?.status === 'ready' && can('platform.manage') && <DownloadButton exportId={job.id} tenant={picked.name} />}
          {can('platform.manage') && (
            <button
              type="button"
              className="link"
              style={{ fontSize: 12, marginRight: 12 }}
              disabled={queue.isPending}
              aria-label={t('exports.exportFor', { tenant: picked.name })}
              onClick={() =>
                queue.mutate(
                  { tenantId: picked.id, format, includeMedia },
                  {
                    onSuccess: () =>
                      toast(
                        t(includeMedia ? 'exports.queuedToastMedia' : 'exports.queuedToast', {
                          tenant: picked.name,
                          format: t(`enums.exportFormat.${format}`),
                        }),
                      ),
                  },
                )
              }
            >
              {job ? t('exports.exportAgain') : t('exports.exportData')}
            </button>
          )}
          <button type="button" className="link link--muted" style={{ fontSize: 12 }} onClick={() => setPicked(null)}>
            {t('exports.clearPick')}
          </button>
        </section>
      )}
    </div>
  );
}

/** Every school's exports, newest first, one page at a time (`?exportsPage=`). */
function RecentExports() {
  const t = useT();
  const can = useCan();
  const [state, setState] = useUrlState({ exportsPage: '1' });
  const page = Math.max(1, Number(state.exportsPage) || 1);
  const q = useTenantExports({ page });
  return (
    <>
      <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
        {t('exports.recent')}
      </h3>
      {q.isPending ? (
        <SkeletonRows rows={3} />
      ) : q.isError ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <Empty>{t('exports.recentEmpty')}</Empty>
      ) : (
        <>
          <ul
            className="plain-list"
            aria-label={t('exports.recent')}
            aria-busy={q.isPlaceholderData}
            style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}
          >
            {q.data.data.map((job) => (
              <li key={job.id} className="row" style={{ padding: '10px 0' }}>
                <span className="min0" style={{ flex: 1 }}>
                  <span className="ellipsis" style={{ fontWeight: 600, display: 'block' }}>
                    {job.tenantName}
                  </span>
                  <JobLine job={job} />
                </span>
                {job.status === 'ready' && can('platform.manage') && <DownloadButton exportId={job.id} tenant={job.tenantName} />}
              </li>
            ))}
          </ul>
          <Pagination meta={q.data.meta} onPage={(p) => setState({ exportsPage: String(p) })} noun={t('exports.exportsNoun')} />
        </>
      )}
    </>
  );
}

function DownloadButton({ exportId, tenant, primary }: { exportId: string; tenant: string; primary?: boolean }) {
  const t = useT();
  const download = useExportDownload();
  return (
    <button
      type="button"
      className={primary ? 'btn btn--primary btn--sm' : 'link'}
      style={primary ? undefined : { fontSize: 12, marginRight: 12 }}
      disabled={download.isPending}
      aria-label={t('exports.downloadFor', { tenant })}
      onClick={() => download.mutate(exportId)}
    >
      {download.isPending && <Spinner />} {t('exports.download')}
    </button>
  );
}

/**
 * The "Your data export is ready" email links to `?section=exports&export={id}`: show that export first, with its
 * download (a signed-in, authorised member gets a short-lived URL; the email never carries one). Fetched by id
 * (`GET /backup/exports/{id}`), so an export of any age is found.
 */
function LinkedExport({ id }: { id: string }) {
  const t = useT();
  const can = useCan();
  const q = useTenantExport(id);
  if (q.isPending) return <SkeletonRows rows={1} />;
  const job = q.data;
  return (
    <div className="callout" role="status" style={{ display: 'block', marginTop: 10 }}>
      {job ? (
        <div className="hstack wrap" style={{ gap: 10, justifyContent: 'space-between' }}>
          <span className="t-sm">
            {t('exports.linked', {
              tenant: job.tenantName,
              format: t(`enums.exportFormat.${job.format}`),
              status: t(`enums.exportStatus.${job.status}`),
            })}
          </span>
          {job.status === 'ready' && can('platform.manage') && <DownloadButton exportId={job.id} tenant={job.tenantName} primary />}
        </div>
      ) : q.error instanceof ApiError && q.error.status === 404 ? (
        <span className="t-sm">{t('exports.linkedMissing')}</span>
      ) : (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
      )}
    </div>
  );
}

export function TenantExports() {
  const t = useT();
  const can = useCan();
  const [params] = useSearchParams();
  const linked = params.get('export');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeMedia, setIncludeMedia] = useState(true);
  return (
    <Card title={t('exports.title')}>
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 0 }}>
        {t('exports.intro')}
      </p>
      {linked && <LinkedExport id={linked} />}
      {can('platform.manage') && (
        <div className="hstack wrap" style={{ gap: 12, marginTop: 10 }}>
          <Select
            label={t('exports.format')}
            value={format}
            onChange={setFormat}
            options={EXPORT_FORMATS.map((f) => [f, t(`enums.exportFormat.${f}`)] as const)}
            style={{ width: 'auto' }}
          />
          <div className="hstack">
            <Toggle on={includeMedia} onChange={setIncludeMedia} label={t('exports.includeMedia')} />
            <span className="muted" style={{ fontSize: 12 }} aria-hidden="true">
              {t('exports.includeMedia')}
            </span>
          </div>
        </div>
      )}
      {can('tenants.view') ? <ExportPicker format={format} includeMedia={includeMedia} /> : <Empty>{t('exports.needsTenantAccess')}</Empty>}
      <RecentExports />
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        {t('exports.linkNote')}
      </p>
    </Card>
  );
}
