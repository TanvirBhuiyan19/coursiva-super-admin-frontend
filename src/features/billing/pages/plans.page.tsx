import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorState, FormError, Screen, Seg, Skeleton, SkeletonRows, Spinner, UnsavedChangesGuard } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { usePricing, useSavePricing } from '../api';
import { FeatureMatrix } from '../components/FeatureMatrix';
import { PlanCards } from '../components/PlanCards';
import { PromoCodes } from '../components/PromoCodes';
import {
  applyPricingErrors,
  draftNumber,
  pricingSchema,
  toFormValues,
  toUpdate,
  type PricingForm,
  type PricingFormIn,
} from '../components/pricingForm';
import { signedMoney } from '../format';
import { useT } from '../i18n';
import { ROLLOUTS, type PricingConfig } from '../types';

const DISCOUNT_ERROR_ID = 'annual-discount-error';
const TRIAL_ERROR_ID = 'trial-days-error';
const numInput = { padding: '7px 10px', fontWeight: 700, textAlign: 'center' } as const;

/** Live MRR-impact preview from the tenant counts the API returned per plan. */
function computeImpact(config: PricingConfig | undefined, draft: PricingFormIn['prices'] | undefined, rollout: PricingFormIn['rollout']) {
  if (!config || !draft) return { changed: false, delta: 0 };
  const changedPlans = config.plans.filter((p) => draftNumber(draft[p.plan], p.price) !== p.price);
  const delta = changedPlans.reduce((s, p) => {
    const next = draftNumber(draft[p.plan], p.price);
    // Migrating: every paying tenant moves to the new price. New signups only: projected at today's tenant counts.
    return s + (rollout === 'migrate_all' ? next * p.payingTenants - p.mrr : (next - p.price) * p.tenants);
  }, 0);
  return { changed: changedPlans.length > 0, delta };
}

function ImpactBanner({ config, form, canManage }: { config: PricingConfig; form: PricingForm; canManage: boolean }) {
  const t = useT();
  const [prices, rollout] = form.watch(['prices', 'rollout']);
  const { changed, delta } = computeImpact(config, prices, rollout);
  if (!changed) return null;
  const tenants = config.plans.reduce((s, p) => s + p.tenants, 0);
  return (
    <div className="callout callout--accent hstack wrap" style={{ gap: 12, alignItems: 'center' }} role="status">
      <span className="fg-accent" style={{ fontSize: 13, fontWeight: 700 }}>
        {t('plans.impact.label')}{' '}
        <span className={delta >= 0 ? 'fg-good' : 'fg-bad'}>{t('signedPerMonth', { amount: signedMoney(delta) })}</span>
      </span>
      <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 200 }}>
        {rollout === 'new_signups' ? t('plans.impact.newSignups') : t('plans.impact.migrateAll', { tenants })}
      </span>
      <div style={{ flex: '0 1 300px', minWidth: 240 }}>
        <Seg
          label={t('plans.impact.rolloutLabel')}
          options={ROLLOUTS.map((r) => [r, t(`plans.rollouts.${r}`)] as const)}
          value={rollout}
          disabled={!canManage}
          onChange={(v) => form.setValue('rollout', v, { shouldDirty: true })}
        />
      </div>
    </div>
  );
}

function AddonsCard({ config, form, canManage }: { config: PricingConfig; form: PricingForm; canManage: boolean }) {
  const t = useT();
  const errors = form.formState.errors;
  const discountErr = errors.annualDiscountPct?.message;
  return (
    <section className="card" style={{ flex: '1 1 320px', minWidth: 0 }} aria-labelledby="addons-title">
      <h2 id="addons-title" className="card-title">
        {t('plans.addons.title')}
      </h2>
      <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0' }}>
        {t('plans.addons.intro')}
      </p>
      <ul className="stack plain-list" style={{ marginTop: 8 }}>
        {config.addons.map((a, i) => {
          const err = errors.addons?.[i]?.price?.message;
          return (
            <li key={a.key} className="row wrap" style={{ gap: 10, padding: '10px 0' }}>
              <div className="min0" style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</div>
                <div className="faint" style={{ fontSize: 11, marginTop: 1 }}>
                  {a.availability}
                </div>
                {err && (
                  <div id={`addon-${a.key}-error`} className="field-error" role="alert">
                    {err}
                  </div>
                )}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }} aria-hidden="true">
                $
              </span>
              <input
                className="input"
                inputMode="decimal"
                style={{ ...numInput, width: 72 }}
                aria-label={t('plans.addons.priceLabel', { addon: a.label })}
                readOnly={!canManage}
                {...(err ? { 'aria-invalid': true, 'aria-describedby': `addon-${a.key}-error` } : {})}
                {...form.register(`addons.${i}.price`)}
              />
              <span className="faint" style={{ fontSize: 12 }}>
                {t('perMonth')}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="hstack wrap" style={{ gap: 10, marginTop: 16 }}>
        <label htmlFor="annual-discount" style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
          {t('plans.addons.annualDiscount')}
        </label>
        <input
          id="annual-discount"
          className="input"
          inputMode="numeric"
          style={{ ...numInput, width: 60 }}
          readOnly={!canManage}
          {...(discountErr ? { 'aria-invalid': true, 'aria-describedby': DISCOUNT_ERROR_ID } : {})}
          {...form.register('annualDiscountPct')}
        />
        <span className="muted" style={{ fontSize: 12.5 }}>
          {t('plans.addons.percentOff')}
        </span>
      </div>
      {discountErr && (
        <div id={DISCOUNT_ERROR_ID} className="field-error" role="alert">
          {discountErr}
        </div>
      )}
    </section>
  );
}

function PlansSkeleton() {
  return (
    <>
      <div className="grid-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card stack" style={{ gap: 12 }}>
            <Skeleton h={16} w="40%" />
            <Skeleton h={34} w="55%" />
            <SkeletonRows rows={4} h={12} />
          </div>
        ))}
      </div>
      <div className="card">
        <SkeletonRows rows={5} h={20} />
      </div>
    </>
  );
}

export default function PlansPage() {
  const t = useT();
  const can = useCan();
  const canManage = can('billing.manage');
  const pricing = usePricing();
  const save = useSavePricing();
  const [formError, setFormError] = useState<string | null>(null);
  const config = pricing.data;
  const values = useMemo(() => (config ? toFormValues(config) : undefined), [config]);
  const form = useZodForm(pricingSchema, { mode: 'onSubmit' });
  const trialErr = form.formState.errors.trialDays?.message;
  // Dirty = the draft differs from the last server values.
  const current = form.watch();
  const dirty = !!values && JSON.stringify(current) !== JSON.stringify(values);
  // Load server values into the form when they arrive or change — unless the operator has unsaved edits.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });
  const loaded = useRef(false);
  useEffect(() => {
    if (!values) return;
    if (!loaded.current || !dirtyRef.current) form.reset(values);
    loaded.current = true;
  }, [values, form]);

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    save.mutate(toUpdate(v), {
      onSuccess: (res) => {
        form.reset(toFormValues(res.pricing));
        toast(res.migratedTenants ? t('plans.toasts.savedMigrated', { count: res.migratedTenants }) : t('plans.toasts.savedNewSignups'));
      },
      onError: (err) => {
        if (!applyPricingErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  if (pricing.error)
    return (
      <Screen max={1150} label={t('plans.title')}>
        <ErrorState error={pricing.error} onRetry={() => void pricing.refetch()} />
      </Screen>
    );

  return (
    <Screen max={1150} label={t('plans.title')}>
      {!config ? (
        <PlansSkeleton />
      ) : (
        // Not a <form>: the promo-code form sits inside this layout and forms can't nest. Save submits explicitly.
        <div className="stack" style={{ gap: 16 }}>
          <PlanCards plans={config.plans} form={form} canManage={canManage} />
          <ImpactBanner config={config} form={form} canManage={canManage} />
          <FeatureMatrix features={config.features} canManage={canManage} />
          <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
            <AddonsCard config={config} form={form} canManage={canManage} />
            <PromoCodes canManage={canManage} style={{ flex: '1.4 1 440px', minWidth: 0 }} />
          </div>
          <div className="card hstack wrap" style={{ padding: 18, gap: 14 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="trial-days" style={{ fontWeight: 700, fontSize: 13.5 }}>
                {t('plans.trial.label')}
              </label>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {t('plans.trial.hint')}
              </div>
              {trialErr && (
                <div id={TRIAL_ERROR_ID} className="field-error" role="alert">
                  {trialErr}
                </div>
              )}
            </div>
            <div className="hstack">
              <input
                id="trial-days"
                className="input"
                inputMode="numeric"
                style={{ ...numInput, width: 64, fontSize: 14 }}
                readOnly={!canManage}
                {...(trialErr ? { 'aria-invalid': true, 'aria-describedby': TRIAL_ERROR_ID } : {})}
                {...form.register('trialDays')}
              />
              <span className="muted" style={{ fontSize: 13 }}>
                {t('plans.trial.days')}
              </span>
            </div>
            {canManage && (
              <div className="hstack" style={{ gap: 8 }}>
                {dirty && (
                  <span className="t-xs fg-warn" role="status">
                    {t('plans.unsaved')}
                  </span>
                )}
                <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => values && form.reset(values)}>
                  {t('plans.discard')}
                </button>
                <button type="button" className="btn btn--primary" disabled={!dirty || save.isPending} onClick={() => void onSubmit()}>
                  {save.isPending && <Spinner />} {t('plans.save')}
                </button>
              </div>
            )}
          </div>
          <FormError>{formError}</FormError>
          <UnsavedChangesGuard when={canManage && dirty && !save.isPending} />
        </div>
      )}
    </Screen>
  );
}
