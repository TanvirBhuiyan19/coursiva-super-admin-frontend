import { Link } from 'react-router-dom';
import { Bar, Card, QueryState, SkeletonRows } from '@/components/ui';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { toast } from '@/store/ui';
import { useAddToRoadmap, useIntegrationSettings } from '../api';
import { useT } from '../i18n';

/** Marketplace adoption and tenant requests. What tenants may connect is switched on Feature availability. */
export function IntegrationsCard() {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const q = useIntegrationSettings();
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
        {t('integrations.intro')} {t('integrations.availabilityNote')}{' '}
        <Link to={pathOf('availability')} className="link">
          {t('integrations.availabilityLink')}
        </Link>
      </p>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={6} />}>
        {(d) => (
          <>
            <h3 className="eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>
              {t('integrations.adoption')}
            </h3>
            <ul className="plain-list">
              {d.adoption.map((a) => (
                <li key={a.name} className="row wrap" style={{ fontSize: 12.5, gap: 12 }}>
                  <span className="ext-tile ext-tile--sm" aria-hidden="true">
                    <BrandLogo brand={a.name} size={14} />
                  </span>
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
