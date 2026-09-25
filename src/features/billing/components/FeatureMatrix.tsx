import { Link } from 'react-router-dom';
import { pathOf } from '@/app/screens';
import { PLANS } from '@/lib/domain';
import { cx } from '@/lib/cx';
import { toast } from '@/store/ui';
import { useSetPlanFeature } from '../api';
import type { PlanFeature } from '../types';

const COLS = 'minmax(0,2fr) repeat(3, minmax(0,1fr))';
const MIN = 460;

export function FeatureMatrix({ features, canManage }: { features: PlanFeature[]; canManage: boolean }) {
  const setFeature = useSetPlanFeature();
  return (
    <section className="card table-scroll" aria-labelledby="feature-matrix">
      <h2 id="feature-matrix" className="card-title" style={{ marginBottom: 4 }}>
        Feature matrix
      </h2>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        Commercial plan flags only{canManage ? ' — click a cell to include or exclude' : ''}. Which <b>LMS modules</b> each plan unlocks is
        set in{' '}
        <Link className="link" style={{ fontSize: 12.5 }} to={pathOf('entitlements')}>
          Platform settings → Entitlements
        </Link>
        .
      </p>
      <div role="table" aria-label="Plan feature matrix">
        <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 10, padding: '8px 0' }}>
          <div role="columnheader">Feature</div>
          {PLANS.map((p) => (
            <div key={p} role="columnheader" style={{ textAlign: 'center' }}>
              {p}
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
              return (
                <div key={p} role="cell" style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${f.label} on ${p}`}
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
                        { onSuccess: () => toast(`${f.label} ${on ? 'removed from' : 'included in'} ${p} — applies to every ${p} tenant`) },
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
