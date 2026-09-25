import { Bar, Card, QueryState, SkeletonRows, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { toast } from '@/store/ui';
import { useAddToRoadmap, useIntegrationSettings, useSetIntegrationPolicy } from '../api';
import { useT } from '../i18n';

/** What tenants may connect. Each policy toggle saves immediately (optimistic). */
export function IntegrationsCard() {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const q = useIntegrationSettings();
  const setPolicy = useSetIntegrationPolicy();
  const roadmap = useAddToRoadmap();

  return (
    <Card
      title={t('integrations.title')}
      sub={
        q.data
          ? t('integrations.sub', { liveApps: q.data.liveApps, categories: q.data.categories, count: q.data.requests.length })
          : undefined
      }
    >
      <p className="t-sm muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
        {t('integrations.intro')}
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
                    { onSuccess: () => toast(t(enabled ? 'integrations.policyOn' : 'integrations.policyOff', { label: p.label })) },
                  )
                }
              />
            ))}

            <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
              {t('integrations.adoption')}
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
                    <Bar
                      value={a.totalTenants ? Math.round((a.tenants / a.totalTenants) * 100) : 0}
                      label={t('integrations.adoptionLabel', { name: a.name })}
                    />
                  </span>
                  <span className="nowrap" style={{ width: 110, fontWeight: 700 }}>
                    {t('integrations.adoptionCount', { tenants: a.tenants, count: a.totalTenants })}
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
              {t('integrations.requests')}
            </h3>
            <ul className="hstack wrap plain-list" style={{ gap: 8 }}>
              {d.requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={r.onRoadmap}
                    disabled={!manage || r.onRoadmap}
                    aria-label={t(r.onRoadmap ? 'integrations.onRoadmap' : 'integrations.addToRoadmap', { name: r.name })}
                    onClick={() =>
                      roadmap.mutate(r.id, {
                        onSuccess: () => toast(t('integrations.addedToRoadmap', { name: r.name })),
                      })
                    }
                  >
                    {r.onRoadmap ? '✓ ' : ''}
                    {r.name} <span className="faint">· {t('integrations.requestCount', { count: r.requests })}</span>
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
