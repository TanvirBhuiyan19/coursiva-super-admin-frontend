import { Badge } from '@/components/ui';
import { money } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { staffSeatsText, storageText, studentsText } from '../format';
import { t as tBilling, useT } from '../i18n';
import type { PlanPricing } from '../types';
import type { PricingForm } from './pricingForm';

function bullets(p: PlanPricing) {
  const { staffSeats, students, storageGb, liveRoomMinutes } = p.limits;
  return [
    staffSeatsText(staffSeats),
    studentsText(students),
    storageText(storageGb),
    liveRoomMinutes > 0 ? tBilling('planCards.liveRoomMinutes', { minutes: liveRoomMinutes }) : tBilling('planCards.liveRoomExternal'),
    p.highlight,
  ];
}

export function PlanCards({ plans, form, canManage }: { plans: PlanPricing[]; form: PricingForm; canManage: boolean }) {
  const t = useT();
  const tc = useCommonT();
  const errors = form.formState.errors.prices;
  return (
    <div className="grid-3" style={{ alignItems: 'stretch' }}>
      {plans.map((p) => {
        const error = errors?.[p.plan]?.message;
        const errId = `price-${p.plan}-error`;
        const planLabel = tc(`enums.plan.${p.plan}`);
        return (
          <section key={p.plan} className="card stack" style={{ borderRadius: 14, gap: 12 }} aria-labelledby={`plan-${p.plan}`}>
            <div className="hstack" style={{ gap: 10 }}>
              <h2 id={`plan-${p.plan}`} className="display" style={{ fontWeight: 700, fontSize: 16, flex: 1, margin: 0 }}>
                {planLabel}
              </h2>
              <Badge tone="flat" pill>
                {t('planCards.tenants', { count: p.tenants })}
              </Badge>
            </div>
            <div>
              <div className="hstack" style={{ gap: 6 }}>
                <span className="display" style={{ fontSize: 20, fontWeight: 800 }} aria-hidden="true">
                  $
                </span>
                <input
                  className="input display"
                  style={{ width: 96, padding: '7px 10px', fontSize: 20, fontWeight: 800 }}
                  inputMode="decimal"
                  aria-label={t('planCards.monthlyPrice', { plan: planLabel })}
                  readOnly={!canManage}
                  {...(error ? { 'aria-invalid': true, 'aria-describedby': errId } : {})}
                  {...form.register(`prices.${p.plan}`)}
                />
                <span className="muted" style={{ fontSize: 13 }}>
                  {t('perMonth')}
                </span>
              </div>
              {error && (
                <div id={errId} className="field-error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <ul className="stack plain-list" style={{ gap: 7, flex: 1 }}>
              {bullets(p).map((b) => (
                <li key={b} style={{ fontSize: 12.5, color: 'var(--tx2)', display: 'flex', gap: 8 }}>
                  <span className="fg-good" style={{ fontWeight: 800 }} aria-hidden="true">
                    ✓
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <div className="muted" style={{ fontSize: 12 }}>
              {t('planCards.mrrFromPlan')} <b style={{ color: 'var(--tx)' }}>{money(p.mrr)}</b>
            </div>
          </section>
        );
      })}
    </div>
  );
}
