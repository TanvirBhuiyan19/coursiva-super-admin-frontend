import { useState } from 'react';
import { Card, Empty, ErrorState, Select, SkeletonRows, Toggle } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useTenants } from '@/features/tenants/api';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useQueueExport, useTenantExports } from '../api';
import { useT } from '../i18n';
import { EXPORT_FORMATS, type ExportFormat } from '../types';

const SHOWN = 6;

function TenantExportList({ format, includeMedia }: { format: ExportFormat; includeMedia: boolean }) {
  const t = useT();
  const can = useCan();
  const tenants = useTenants({ perPage: 100, sort: 'name' });
  const exportsQ = useTenantExports();
  const queue = useQueueExport();
  const [all, setAll] = useState(false);

  if (tenants.error) return <ErrorState compact error={tenants.error} onRetry={() => void tenants.refetch()} />;
  if (tenants.isPending) return <SkeletonRows rows={4} />;
  const rows = tenants.data.data;
  if (!rows.length) return <Empty>{t('exports.noTenants')}</Empty>;
  const latest = (tenantId: string) => exportsQ.data?.find((e) => e.tenantId === tenantId);

  return (
    <>
      <ul className="plain-list" aria-label={t('exports.tenants')}>
        {(all ? rows : rows.slice(0, SHOWN)).map((tn) => {
          const job = latest(tn.id);
          return (
            <li key={tn.id} className="row" style={{ padding: '10px 0' }}>
              <span className="min0" style={{ flex: 1 }}>
                <span className="ellipsis" style={{ fontWeight: 600, display: 'block' }}>
                  {tn.name}
                </span>
                {job && (
                  <span className="t-xs faint">
                    {t('exports.jobLine', {
                      status: job.status === 'ready' ? t('exports.ready') : t('exports.queued'),
                      format: t(`enums.exportFormat.${job.format}`),
                      when: timeAgo(job.requestedAt),
                      name: job.requestedByName,
                    })}
                  </span>
                )}
              </span>
              {can('platform.manage') && (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 12 }}
                  disabled={queue.isPending && queue.variables.tenantId === tn.id}
                  aria-label={t('exports.exportFor', { tenant: tn.name })}
                  onClick={() =>
                    queue.mutate(
                      { tenantId: tn.id, format, includeMedia },
                      {
                        onSuccess: () =>
                          toast(
                            t(includeMedia ? 'exports.queuedToastMedia' : 'exports.queuedToast', {
                              tenant: tn.name,
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
            </li>
          );
        })}
      </ul>
      {rows.length > SHOWN && (
        <button type="button" className="link" style={{ fontSize: 12, marginTop: 6 }} onClick={() => setAll((v) => !v)}>
          {all ? t('exports.showFewer') : t('exports.showAll', { count: rows.length })}
        </button>
      )}
    </>
  );
}

export function TenantExports() {
  const t = useT();
  const can = useCan();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeMedia, setIncludeMedia] = useState(true);
  return (
    <Card title={t('exports.title')}>
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 0 }}>
        {t('exports.intro')}
      </p>
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
      {can('tenants.view') ? (
        <TenantExportList format={format} includeMedia={includeMedia} />
      ) : (
        <Empty>{t('exports.needsTenantAccess')}</Empty>
      )}
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        {t('exports.linkNote')}
      </p>
    </Card>
  );
}
