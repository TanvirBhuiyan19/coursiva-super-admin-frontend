import { Avatar, Bar } from '@/components/ui';
import { avatarColor, initials, money, num } from '@/lib/format';
import { useUi } from '@/store/ui';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useTenant } from '../api';
import { useT } from '../i18n';

/**
 * Read-only mirror of the tenant's dashboard shown after "Sign in as owner".
 * In production the tenant app opens with a short-lived impersonation token; this preview
 * lets staff check the essentials without leaving the console. The session is audited server-side.
 */
export function ImpersonationView() {
  const t = useT();
  const tc = useCommonT();
  const tenantId = useUi((s) => s.impersonating);
  const setUi = useUi((s) => s.set);
  const { data: tn } = useTenant(tenantId ?? undefined);
  if (!tenantId || !tn) return null;
  const kpis = [
    [t('impersonation.kpis.revenue'), money(tn.mrr ? tn.students * 3 : 0)],
    [t('impersonation.kpis.activeStudents'), num(tn.students)],
    [t('impersonation.kpis.publishedCourses'), num(3 + (tn.name.length % 4))],
    [t('impersonation.kpis.avgCompletion'), `${54 + ((tn.name.length * 7) % 21)}%`],
  ];
  const courses: [string, number][] = [
    [t('impersonation.courses.flagship'), 72],
    [t('impersonation.courses.onboarding'), 64],
    [t('impersonation.courses.advanced'), 41],
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label={t('impersonation.label', { name: tn.name })} className="impersonation">
      <div className="impersonation-bar" role="status">
        <span style={{ flex: 1 }}>{t('impersonation.banner', { name: tn.name, owner: tn.ownerName })}</span>
        <button type="button" className="impersonation-exit" onClick={() => setUi({ impersonating: null })}>
          {t('impersonation.exit')}
        </button>
      </div>
      <div className="hstack" style={{ background: 'var(--card)', borderBottom: '1px solid var(--bd)', padding: '14px 24px', gap: 12 }}>
        <Avatar text={initials(tn.name)} color={avatarColor(tn.id)} size={32} radius={8} fontSize={13} />
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>
            {tn.name}
          </div>
          <div className="t-xs muted">{t('impersonation.planLine', { domain: tn.domain, plan: tc(`enums.plan.${tn.plan}`) })}</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="screen" style={{ maxWidth: 1000 }}>
          <div className="grid-kpi">
            {kpis.map(([label, value]) => (
              <div key={label} className="card" style={{ padding: 16 }}>
                <div className="kpi-label">{label}</div>
                <div className="kpi-value kpi-value--sm">{value}</div>
              </div>
            ))}
          </div>
          <section className="card" aria-label={t('impersonation.courses.label')}>
            <h2 className="card-title" style={{ marginBottom: 10 }}>
              {t('impersonation.courses.title')}
            </h2>
            {courses.map(([title, p]) => (
              <div key={title} className="row" style={{ gap: 14, padding: '12px 0', fontSize: 13.5 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{title}</span>
                <Bar value={p} style={{ flex: '0 0 180px' }} label={t('impersonation.courses.completion', { title, pct: p })} />
                <span className="muted" style={{ fontSize: 12, width: 36 }}>
                  {p}%
                </span>
              </div>
            ))}
            <p className="note" style={{ paddingTop: 12, margin: 0 }}>
              {t('impersonation.note')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
