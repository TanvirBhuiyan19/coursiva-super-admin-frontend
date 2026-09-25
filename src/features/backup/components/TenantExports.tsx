import { useState } from 'react';
import { Card, Empty, ErrorState, Select, SkeletonRows, Toggle } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useTenants } from '@/features/tenants/api';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useQueueExport, useTenantExports } from '../api';
import { EXPORT_FORMAT_LABELS, EXPORT_FORMATS, type ExportFormat } from '../types';

const SHOWN = 6;

function TenantExportList({ format, includeMedia }: { format: ExportFormat; includeMedia: boolean }) {
  const can = useCan();
  const tenants = useTenants({ perPage: 100, sort: 'name' });
  const exportsQ = useTenantExports();
  const queue = useQueueExport();
  const [all, setAll] = useState(false);

  if (tenants.error) return <ErrorState compact error={tenants.error} onRetry={() => void tenants.refetch()} />;
  if (tenants.isPending) return <SkeletonRows rows={4} />;
  const rows = tenants.data.data;
  if (!rows.length) return <Empty>No tenants to export.</Empty>;
  const latest = (tenantId: string) => exportsQ.data?.find((e) => e.tenantId === tenantId);

  return (
    <>
      <ul className="plain-list" aria-label="Tenants">
        {(all ? rows : rows.slice(0, SHOWN)).map((t) => {
          const job = latest(t.id);
          return (
            <li key={t.id} className="row" style={{ padding: '10px 0' }}>
              <span className="min0" style={{ flex: 1 }}>
                <span className="ellipsis" style={{ fontWeight: 600, display: 'block' }}>
                  {t.name}
                </span>
                {job && (
                  <span className="t-xs faint">
                    {job.status === 'ready' ? '✓ Ready' : 'Queued'} · {EXPORT_FORMAT_LABELS[job.format]} · {timeAgo(job.requestedAt)} by{' '}
                    {job.requestedByName}
                  </span>
                )}
              </span>
              {can('platform.manage') && (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 12 }}
                  disabled={queue.isPending && queue.variables.tenantId === t.id}
                  aria-label={`Export data for ${t.name}`}
                  onClick={() =>
                    queue.mutate(
                      { tenantId: t.id, format, includeMedia },
                      {
                        onSuccess: () =>
                          toast(
                            `Export queued for ${t.name} (${EXPORT_FORMAT_LABELS[format]}${includeMedia ? ' + media manifests' : ''}) — the link emails to you and expires in 7 days`,
                          ),
                      },
                    )
                  }
                >
                  {job ? 'Export again' : 'Export data'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > SHOWN && (
        <button type="button" className="link" style={{ fontSize: 12, marginTop: 6 }} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length} tenants`}
        </button>
      )}
    </>
  );
}

export function TenantExports() {
  const can = useCan();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [includeMedia, setIncludeMedia] = useState(true);
  return (
    <Card title="Per-tenant exports">
      <p className="t-sm muted" style={{ marginTop: -4, marginBottom: 0 }}>
        Full data export for offboarding or GDPR portability.
      </p>
      {can('platform.manage') && (
        <div className="hstack wrap" style={{ gap: 12, marginTop: 10 }}>
          <Select
            label="Export format"
            value={format}
            onChange={setFormat}
            options={EXPORT_FORMATS.map((f) => [f, EXPORT_FORMAT_LABELS[f]] as const)}
            style={{ width: 'auto' }}
          />
          <div className="hstack">
            <Toggle on={includeMedia} onChange={setIncludeMedia} label="Include media manifests" />
            <span className="muted" style={{ fontSize: 12 }} aria-hidden="true">
              Include media manifests
            </span>
          </div>
        </div>
      )}
      {can('tenants.view') ? (
        <TenantExportList format={format} includeMedia={includeMedia} />
      ) : (
        <Empty>Tenant access is needed to list tenants for export.</Empty>
      )}
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        Download links email to you and expire after 7 days.
      </p>
    </Card>
  );
}
