import { Badge, Card, ErrorState, Screen, SkeletonRows, Spinner, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { num, timeAgo } from '@/lib/format';
import { intlLocale } from '@/lib/i18n';
import { toast } from '@/store/ui';
import { useReprocessImport, useStandards } from '../api';
import { Tiles } from '../components/Tiles';
import { useT } from '../i18n';
import type { FailedImport, StandardSupport, Standards } from '../types';

const COLS = 'minmax(0,1.3fr) minmax(0,0.7fr) minmax(0,1fr) minmax(0,2fr) minmax(0,1fr)';
const SUPPORT_TONE: Record<StandardSupport, Tone> = { Supported: 'good', Partial: 'warn', 'Not supported': 'flat' };
const A11Y_TONE: Record<Standards['accessibility'][number]['status'], Tone> = {
  Conformant: 'good',
  Partial: 'warn',
  'Not conformant': 'bad',
};
/** 1.2M · 9,410 */
const compact = (n: number) =>
  n >= 100_000 ? new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n) : num(n);

function ImportRow({ row, canManage }: { row: FailedImport; canManage: boolean }) {
  const t = useT();
  const reprocess = useReprocessImport();
  return (
    <li className="row wrap" style={{ gap: 10, fontSize: 12.5 }}>
      <div style={{ flex: 1, minWidth: 170 }}>
        <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
          {row.file}
        </div>
        <div className="faint" style={{ fontSize: 11 }}>
          {row.tenantName} · {row.reason} · <time dateTime={row.failedAt}>{timeAgo(row.failedAt)}</time>
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          className="btn btn--sm"
          style={{ padding: '6px 11px', fontSize: 11.5 }}
          disabled={reprocess.isPending}
          aria-label={t('standards.reprocessLabel', { file: row.file })}
          onClick={() => reprocess.mutate(row.id, { onSuccess: (r) => toast(r.message, r.outcome === 'imported' ? 'default' : 'error') })}
        >
          {reprocess.isPending && <Spinner />} {t('standards.reprocess')}
        </button>
      )}
    </li>
  );
}

export default function StandardsPage() {
  const t = useT();
  const can = useCan();
  const q = useStandards();
  const d = q.data;
  const canManage = can('platform.manage');

  if (q.error)
    return (
      <Screen max={1250}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1250} label={t('standards.screenLabel')}>
      <Tiles
        items={
          d && [
            { label: t('standards.tiles.scorm'), value: num(d.summary.scormPackages), sub: t('standards.tiles.scormSub') },
            { label: t('standards.tiles.xapi'), value: compact(d.summary.xapiStatements24h), sub: t('standards.tiles.xapiSub') },
            { label: t('standards.tiles.lti'), value: compact(d.summary.ltiLaunches30d), sub: t('standards.tiles.ltiSub') },
            { label: t('standards.tiles.failed'), value: num(d.summary.failedImports), sub: t('standards.tiles.failedSub') },
          ]
        }
      />

      <div className="card table-scroll" style={{ padding: '6px 18px 4px' }}>
        <div role="table" aria-label={t('standards.table')}>
          <TRow cols={COLS} min={720} head style={{ gap: 10, fontSize: 10.5 }}>
            <div role="columnheader">{t('standards.cols.standard')}</div>
            <div role="columnheader">{t('standards.cols.direction')}</div>
            <div role="columnheader">{t('standards.cols.inUse')}</div>
            <div role="columnheader">{t('standards.cols.notes')}</div>
            <div role="columnheader">{t('standards.cols.support')}</div>
          </TRow>
          {!d && <SkeletonRows rows={6} h={22} />}
          {d?.standards.map((s) => (
            <TRow key={s.id} cols={COLS} min={720} style={{ gap: 10, padding: '11px 0', fontSize: 12.5 }}>
              <div role="cell" style={{ fontWeight: 700 }}>
                {s.name}
              </div>
              <div role="cell" className="muted">
                {t(`enums.standardDirection.${s.direction}`)}
              </div>
              <div role="cell">{s.packages ? t('standards.packages', { count: s.packages }) : t('standards.notInUse')}</div>
              <div role="cell" className="muted" style={{ lineHeight: 1.45 }}>
                {s.note}
              </div>
              <div role="cell">
                <Badge tone={SUPPORT_TONE[s.support]} style={{ fontSize: 11, padding: '3px 8px' }}>
                  {t(`enums.standardSupport.${s.support}`)}
                </Badge>
              </div>
            </TRow>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <Card title={t('standards.failedTitle')} style={{ padding: '18px 20px' }}>
          {!d ? (
            <SkeletonRows rows={2} h={22} />
          ) : d.failedImports.length ? (
            <ul className="plain-list">
              {d.failedImports.map((r) => (
                <ImportRow key={r.id} row={r} canManage={canManage} />
              ))}
            </ul>
          ) : (
            <div className="muted t-sm" style={{ padding: '14px 0' }}>
              {t('standards.allClean')}
            </div>
          )}
        </Card>
        <Card title={t('standards.a11yTitle')} style={{ padding: '18px 20px' }}>
          <p className="muted t-sm" style={{ margin: '0 0 4px' }}>
            {t('standards.a11yIntro')}
          </p>
          {!d ? (
            <SkeletonRows rows={4} h={22} />
          ) : (
            <ul className="plain-list">
              {d.accessibility.map((a) => (
                <li key={a.surface} className="row" style={{ gap: 10, fontSize: 12.5 }}>
                  <div className="min0" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{a.surface}</div>
                    <div className="faint" style={{ fontSize: 11 }}>
                      {a.level} · {a.note}
                    </div>
                  </div>
                  <Badge tone={A11Y_TONE[a.status]} style={{ fontSize: 11, padding: '3px 8px' }}>
                    {t(`enums.a11yStatus.${a.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
        {t('standards.note')}
      </div>
    </Screen>
  );
}
