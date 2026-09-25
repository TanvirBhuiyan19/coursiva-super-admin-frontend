import { Badge } from '@/components/ui';
import { money, num } from '@/lib/format';
import { limitText, storageText } from '../format';
import type { PlanPricing } from '../types';
import type { PricingForm } from './pricingForm';

function bullets(p: PlanPricing) {
  const { staffSeats, students, storageGb, liveRoomMinutes } = p.limits;
  return [
    limitText(staffSeats, 'staff seats'),
    limitText(students, 'students'),
    storageText(storageGb),
    liveRoomMinutes > 0 ? `${num(liveRoomMinutes)} built-in live-room min/mo` : 'Live classes via their own Zoom, Meet or Teams',
    p.highlight,
  ];
}

export function PlanCards({ plans, form, canManage }: { plans: PlanPricing[]; form: PricingForm; canManage: boolean }) {
  const errors = form.formState.errors.prices;
  return (
    <div className="grid-3" style={{ alignItems: 'stretch' }}>
      {plans.map((p) => {
        const error = errors?.[p.plan]?.message;
        const errId = `price-${p.plan}-error`;
        return (
          <section key={p.plan} className="card stack" style={{ borderRadius: 14, gap: 12 }} aria-labelledby={`plan-${p.plan}`}>
            <div className="hstack" style={{ gap: 10 }}>
              <h2 id={`plan-${p.plan}`} className="display" style={{ fontWeight: 700, fontSize: 16, flex: 1, margin: 0 }}>
                {p.plan}
              </h2>
              <Badge tone="flat" pill>
                {p.tenants} {p.tenants === 1 ? 'tenant' : 'tenants'}
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
                  aria-label={`${p.plan} monthly price`}
                  readOnly={!canManage}
                  {...(error ? { 'aria-invalid': true, 'aria-describedby': errId } : {})}
                  {...form.register(`prices.${p.plan}`)}
                />
                <span className="muted" style={{ fontSize: 13 }}>
                  /mo
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
              MRR from this plan: <b style={{ color: 'var(--tx)' }}>{money(p.mrr)}</b>
            </div>
          </section>
        );
      })}
    </div>
  );
}
