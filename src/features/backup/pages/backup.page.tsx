import { Card, Empty, ErrorState, QueryState, Screen, Skeleton, SkeletonRows } from '@/components/ui';
import { formatDate, formatDateTime, num, timeAgo } from '@/lib/format';
import { useBackupActivity, useBackupSettings, useBackupSummary, useRestores } from '../api';
import { BackupPolicy } from '../components/BackupPolicy';
import { RestoreBanner } from '../components/RestoreBanner';
import { RestorePoints } from '../components/RestorePoints';
import { TenantExports } from '../components/TenantExports';
import type { BackupSummary } from '../types';

const duration = (min: number) => (min >= 60 ? `${Math.round(min / 60)} h` : `${min} min`);

function Kpis({ s }: { s: BackupSummary | undefined }) {
  const items: [string, string, string, boolean][] | null = s
    ? [
        ['Last backup', s.lastBackupAt ? timeAgo(s.lastBackupAt) : '—', s.lastBackupVerified ? 'Verified ✓' : 'Verification pending', true],
        ['Protected data', `${num(s.protectedGb)} GB`, `${s.tenants} tenants · ${s.historyTb} TB with history`, true],
        ['RPO / RTO', `${duration(s.rpoMinutes)} / ${duration(s.rtoMinutes)}`, `${s.walWindowDays}-day point-in-time window`, true],
        [
          'Restore drills',
          `${s.drillsPassed} / ${s.drillsTotal} passed`,
          s.lastDrillAt ? `last drill ${formatDate(s.lastDrillAt)}` : 'No drills yet',
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
  const q = useBackupActivity();
  return (
    <Card title="Recent activity">
      <QueryState query={q} compact skeleton={<SkeletonRows rows={4} />}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>No backup activity yet.</Empty>
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
  const summary = useBackupSummary();
  const settings = useBackupSettings();
  const restores = useRestores();
  const list = restores.data ?? [];
  const active = list.find((r) => ['staged', 'approved', 'running'].includes(r.status));

  return (
    <Screen max={1000} label="Backup and restore">
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
          <Card title="Policy & destinations">
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
