// Draft pricing form (plan prices, add-ons, annual discount, trial length, rollout) — saved in one PUT.
import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { PLANS, type Plan } from '@/lib/domain';
import { ROLLOUTS, type PricingConfig, type PricingUpdate } from '../types';

const price = (what: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, `Enter ${what} like 99 or 99.50.`)
    .transform(Number)
    .refine((n) => n <= 100_000, 'Keep prices at $100,000 or less.');

const whole = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((n) => n >= min && n <= max, message);

export const pricingSchema = z.object({
  prices: z.object({ Launch: price('a price'), Growth: price('a price'), Scale: price('a price') }),
  addons: z.array(z.object({ key: z.string(), price: price('a price') })),
  annualDiscountPct: whole(0, 60, 'Use a whole number from 0 to 60.'),
  trialDays: whole(0, 90, 'Use a whole number of days from 0 to 90.'),
  rollout: z.enum(ROLLOUTS),
});

export type PricingFormIn = z.input<typeof pricingSchema>;
export type PricingFormOut = z.output<typeof pricingSchema>;
export type PricingForm = UseFormReturn<PricingFormIn, unknown, PricingFormOut>;

export const toFormValues = (c: PricingConfig): PricingFormIn => ({
  prices: Object.fromEntries(c.plans.map((p) => [p.plan, String(p.price)])) as Record<Plan, string>,
  addons: c.addons.map((a) => ({ key: a.key, price: String(a.price) })),
  annualDiscountPct: String(c.annualDiscountPct),
  trialDays: String(c.trialDays),
  rollout: 'new_signups',
});

export const toUpdate = (v: PricingFormOut): PricingUpdate => ({
  prices: PLANS.map((plan) => ({ plan, price: v.prices[plan] })),
  addons: v.addons,
  annualDiscountPct: v.annualDiscountPct,
  trialDays: v.trialDays,
  rollout: v.rollout,
});

/** Maps the API's 422 field names (`prices.0.price`) onto form fields (`prices.Launch`). Returns true when handled. */
export function applyPricingErrors(form: PricingForm, err: unknown): boolean {
  if (!(err instanceof ApiError) || !err.isValidation) return false;
  let handled = false;
  for (const [key, [message]] of Object.entries(err.fieldErrors)) {
    const planIdx = /^prices\.(\d+)\.price$/.exec(key)?.[1];
    const addonIdx = /^addons\.(\d+)\.price$/.exec(key)?.[1];
    const plan = planIdx != null ? PLANS[Number(planIdx)] : undefined;
    const field = plan
      ? (`prices.${plan}` as const)
      : addonIdx != null
        ? (`addons.${Number(addonIdx)}.price` as const)
        : key === 'annualDiscountPct' || key === 'trialDays'
          ? key
          : null;
    if (field && message) {
      form.setError(field, { type: 'server', message });
      handled = true;
    }
  }
  return handled;
}

/** Parses a draft price for the live preview (NaN-safe). */
export const draftNumber = (s: string | undefined, fallback: number) => {
  const n = Number(s);
  return s != null && s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};
