import { Card, Empty, ErrorState, QueryState, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import { formatDate, formatDateTime, timeAgo } from '@/lib/format';
import { useBackupActivity, useBackupSettings, useBackupSummary, useRestores } from '../api';
import { BackupPolicy } from '../components/BackupPolicy';
import { RestoreBanner } from '../components/RestoreBanner';
import { RestorePoints } from '../components/RestorePoints';
import { TenantExports } from '../components/TenantExports';
import { t as tStatic, useT } from '../i18n';
import type { BackupSummary } from '../types';

const duration = (min: number) =>
  min >= 60 ? tStatic('duration.hours', { count: Math.round(min / 60) }) : tStatic('duration.minutes', { count: min });

function Kpis({ s }: { s: BackupSummary | undefined }) {
  const t = useT();
  const items: [string, string, string, boolean][] | null = s
    ? [
        [
          t('kpi.lastBackup'),
          s.lastBackupAt ? timeAgo(s.lastBackupAt) : '—',
          s.lastBackupVerified ? t('kpi.verified') : t('kpi.verificationPending'),
          true,
        ],
        [
          t('kpi.protectedData'),
          t('kpi.protectedValue', { count: s.protectedGb }),
          t('kpi.protectedSub', { tenants: s.tenants, history: s.historyTb }),
          true,
        ],
        [
          t('kpi.rpoRto'),
          t('kpi.rpoRtoValue', { rpo: duration(s.rpoMinutes), rto: duration(s.rtoMinutes) }),
          t('kpi.pitrWindow', { days: s.walWindowDays }),
          true,
        ],
        [
          t('kpi.drills'),
          t('kpi.drillsValue', { passed: s.drillsPassed, total: s.drillsTotal }),
          s.lastDrillAt ? t('kpi.lastDrill', { date: formatDate(s.lastDrillAt) }) : t('kpi.noDrills'),
          s.drillsPassed === s.drillsTotal,
        ],
      ]
    : null;
  return (
    <div className="grid-kpi" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
      {items
        ? items.map(([label, value, sub, good]) => (
            <div key={label} className="card card--tight">
              <div className="kpi-label">{label}</div>
              <div className="kpi-value kpi-value--sm">{value}</div>
              <div className={good ? 'fg-good' : 'fg-warn'} style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                {sub}
              </div>
            </div>
          ))
        : Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="40%" />
              <Skeleton h={22} w="60%" style={{ marginTop: 8 }} />
            </div>
          ))}
    </div>
  );
}

function Activity() {
  const t = useT();
  const q = useBackupActivity();
  return (
    <Card title={t('activity.title')}>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={4} />}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>{t('activity.empty')}</Empty>
          ) : (
            <ol className="plain-list">
              {rows.map((a) => (
                <li key={a.id} className="row" style={{ display: 'block', padding: '9px 0', fontSize: 12.5 }}>
                  <time className="faint" style={{ fontSize: 11 }} dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                    {timeAgo(a.createdAt)}
                  </time>
                  <div style={{ marginTop: 2 }}>{a.text}</div>
                </li>
              ))}
            </ol>
          )
        }
      </QueryState>
    </Card>
  );
}

export default function BackupPage() {
  const t = useT();
  const summary = useBackupSummary();
  const settings = useBackupSettings();
  const restores = useRestores();
  const list = restores.data ?? [];
  const active = list.find((r) => ['staged', 'approved', 'running'].includes(r.status));

  return (
    <Screen max={1000} label={t('title')}>
      {summary.error ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : <Kpis s={summary.data} />}

      {active && <RestoreBanner restore={active} />}
      {restores.error && <ErrorState error={restores.error} onRetry={() => void restores.refetch()} />}

      <RestorePoints walDays={summary.data?.walWindowDays ?? 7} restores={list} />

      <div className="grid-2">
        {settings.error ? (
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        ) : settings.data && summary.data ? (
          <BackupPolicy settings={settings.data} summary={summary.data} />
        ) : (
          <Card title={t('policy.title')}>
            <SkeletonRows rows={6} />
          </Card>
        )}
        <div className="stack" style={{ gap: 16 }}>
          <TenantExports />
          <Activity />
        </div>
      </div>
    </Screen>
  );
}
