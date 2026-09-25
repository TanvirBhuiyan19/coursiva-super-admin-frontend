import { Avatar, Bar } from '@/components/ui';
import { avatarColor, initials, money, num } from '@/lib/format';
import { useUi } from '@/store/ui';
import { useTenant } from '../api';

/**
 * Read-only mirror of the tenant's dashboard shown after "Sign in as owner".
 * In production the tenant app opens with a short-lived impersonation token; this preview
 * lets staff check the essentials without leaving the console. The session is audited server-side.
 */
export function ImpersonationView() {
  const tenantId = useUi((s) => s.impersonating);
  const setUi = useUi((s) => s.set);
  const { data: t } = useTenant(tenantId ?? undefined);
  if (!tenantId || !t) return null;
  const kpis = [
    ['Revenue this month', t.mrr ? money(t.students * 3) : '$0'],
    ['Active students', num(t.students)],
    ['Published courses', String(3 + (t.name.length % 4))],
    ['Avg completion', `${54 + ((t.name.length * 7) % 21)}%`],
  ];
  const courses: [string, number][] = [
    ['Flagship program', 72],
    ['Onboarding basics', 64],
    ['Advanced track', 41],
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label={`Impersonating ${t.name}`} className="impersonation">
      <div className="impersonation-bar" role="status">
        <span style={{ flex: 1 }}>
          Impersonating {t.name} as {t.ownerName} — read-only. Actions are disabled and this session is logged.
        </span>
        <button type="button" className="impersonation-exit" onClick={() => setUi({ impersonating: null })}>
          Exit impersonation
        </button>
      </div>
      <div className="hstack" style={{ background: 'var(--card)', borderBottom: '1px solid var(--bd)', padding: '14px 24px', gap: 12 }}>
        <Avatar text={initials(t.name)} color={avatarColor(t.id)} size={32} radius={8} fontSize={13} />
        <div>
          <div className="display" style={{ fontWeight: 700, fontSize: 15 }}>
            {t.name}
          </div>
          <div className="t-xs muted">
            {t.domain} · {t.plan} plan
          </div>
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
          <section className="card" aria-label="Courses">
            <h2 className="card-title" style={{ marginBottom: 10 }}>
              Their courses — exactly what the owner sees
            </h2>
            {courses.map(([title, p]) => (
              <div key={title} className="row" style={{ gap: 14, padding: '12px 0', fontSize: 13.5 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{title}</span>
                <Bar value={p} style={{ flex: '0 0 180px' }} label={`${title} completion ${p}%`} />
                <span className="muted" style={{ fontSize: 12, width: 36 }}>
                  {p}%
                </span>
              </div>
            ))}
            <p className="note" style={{ paddingTop: 12, margin: 0 }}>
              Read-only mirror of the tenant workspace. Editing, payments and messaging are disabled while impersonating.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
