import { Bar, Card, QueryState, SkeletonRows, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { plural } from '@/lib/format';
import { toast } from '@/store/ui';
import { useAddToRoadmap, useIntegrationSettings, useSetIntegrationPolicy } from '../api';

/** What tenants may connect. Each policy toggle saves immediately (optimistic). */
export function IntegrationsCard() {
  const can = useCan();
  const manage = can('platform.manage');
  const q = useIntegrationSettings();
  const setPolicy = useSetIntegrationPolicy();
  const roadmap = useAddToRoadmap();

  return (
    <Card
      title="Integration marketplace"
      sub={
        q.data ? `${q.data.liveApps} apps live · ${q.data.categories} categories · ${plural(q.data.requests.length, 'request')}` : undefined
      }
    >
      <p className="t-sm muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
        What tenants may connect, and which apps gate a module until they do. Tenants configure their own credentials — you never hold them.
      </p>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={6} />}>
        {(d) => (
          <>
            {d.policies.map((p) => (
              <ToggleRow
                key={p.key}
                label={p.label}
                sub={p.description}
                on={p.enabled}
                disabled={!manage}
                onChange={(enabled) =>
                  setPolicy.mutate(
                    { key: p.key, enabled },
                    { onSuccess: () => toast(`${p.label} — ${enabled ? 'on for every tenant' : 'off for every tenant'}`) },
                  )
                }
              />
            ))}

            <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
              Adoption across tenants
            </h3>
            <ul className="plain-list">
              {d.adoption.map((a) => (
                <li key={a.name} className="row wrap" style={{ fontSize: 12.5, gap: 12 }}>
                  <span style={{ fontWeight: 600, width: 170 }}>
                    {a.name}{' '}
                    <span className="faint" style={{ fontWeight: 500 }}>
                      · {a.category}
                    </span>
                  </span>
                  <span style={{ width: 110, display: 'flex' }}>
                    <Bar value={a.totalTenants ? Math.round((a.tenants / a.totalTenants) * 100) : 0} label={`${a.name} adoption`} />
                  </span>
                  <span className="nowrap" style={{ width: 110, fontWeight: 700 }}>
                    {a.tenants} of {plural(a.totalTenants, 'tenant')}
                  </span>
                  {a.note && (
                    <span className="muted" style={{ flex: 1, minWidth: 140 }}>
                      {a.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 8 }}>
              Tenant requests
            </h3>
            <ul className="hstack wrap plain-list" style={{ gap: 8 }}>
              {d.requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={r.onRoadmap}
                    disabled={!manage || r.onRoadmap}
                    aria-label={r.onRoadmap ? `${r.name} is on the roadmap` : `Add ${r.name} to the roadmap`}
                    onClick={() =>
                      roadmap.mutate(r.id, {
                        onSuccess: () => toast(`${r.name} added to the integration roadmap — requesters get notified on launch`),
                      })
                    }
                  >
                    {r.onRoadmap ? '✓ ' : ''}
                    {r.name} <span className="faint">· {plural(r.requests, 'request')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
    </Card>
  );
}
