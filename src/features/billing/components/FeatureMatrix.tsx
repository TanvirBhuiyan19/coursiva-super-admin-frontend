import { Link } from 'react-router-dom';
import { pathOf } from '@/app/screens';
import { PLANS } from '@/lib/domain';
import { cx } from '@/lib/cx';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useSetPlanFeature } from '../api';
import { useT } from '../i18n';
import type { PlanFeature } from '../types';

const COLS = 'minmax(0,2fr) repeat(3, minmax(0,1fr))';
const MIN = 460;

export function FeatureMatrix({ features, canManage }: { features: PlanFeature[]; canManage: boolean }) {
  const t = useT();
  const tc = useCommonT();
  const setFeature = useSetPlanFeature();
  return (
    <section className="card table-scroll" aria-labelledby="feature-matrix">
      <h2 id="feature-matrix" className="card-title" style={{ marginBottom: 4 }}>
        {t('featureMatrix.title')}
      </h2>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        {canManage ? t('featureMatrix.introManage') : t('featureMatrix.introView')} {t('featureMatrix.modulesBefore')}{' '}
        <b>{t('featureMatrix.modules')}</b> {t('featureMatrix.modulesAfter')}{' '}
        <Link className="link" style={{ fontSize: 12.5 }} to={pathOf('entitlements')}>
          {t('featureMatrix.modulesLink')}
        </Link>
        .
      </p>
      <div role="table" aria-label={t('featureMatrix.tableLabel')}>
        <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '8px 0' }}>
          <div role="columnheader">{t('columns.feature')}</div>
          {PLANS.map((p) => (
            <div key={p} role="columnheader" style={{ textAlign: 'center' }}>
              {tc(`enums.plan.${p}`)}
            </div>
          ))}
        </div>
        {features.map((f) => (
          <div key={f.key} role="row" className="trow" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '9px 0' }}>
            <div role="rowheader" style={{ fontWeight: 600 }}>
              {f.label}
            </div>
            {PLANS.map((p) => {
              const on = f.plans.includes(p);
              const plan = tc(`enums.plan.${p}`);
              return (
                <div key={p} role="cell" style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={t('featureMatrix.cellLabel', { feature: f.label, plan })}
                    disabled={!canManage}
                    className={cx('badge', on ? 'tone-good' : 'tone-flat')}
                    style={{
                      width: 30,
                      justifyContent: 'center',
                      border: 'none',
                      cursor: canManage ? 'pointer' : 'default',
                      fontWeight: 800,
                    }}
                    onClick={() =>
                      setFeature.mutate(
                        { feature: f.key, plan: p, included: !on },
                        {
                          onSuccess: () =>
                            toast(t(on ? 'featureMatrix.toasts.removed' : 'featureMatrix.toasts.included', { feature: f.label, plan })),
                        },
                      )
                    }
                  >
                    <span aria-hidden="true">{on ? '✓' : '—'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
