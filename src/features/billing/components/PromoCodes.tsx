import { useState } from 'react';
import { z } from 'zod';
import { ConfirmButton, Empty, ErrorState, FormError, Select, SkeletonRows, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useCreatePromo, useDeactivatePromo, usePromos } from '../api';
import { t as tBilling, useT } from '../i18n';
import { PROMO_DURATIONS } from '../types';

const COLS = 'minmax(0,1.1fr) minmax(0,0.8fr) minmax(0,0.9fr) minmax(0,1.1fr) minmax(0,1fr) minmax(84px,0.6fr)';
const MIN = 560;

const percentMessage = { error: () => tBilling('promos.validation.percent') };
const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, { error: () => tBilling('promos.validation.code') }),
  percentOff: z
    .string()
    .trim()
    .regex(/^\d+$/, percentMessage)
    .transform(Number)
    .refine((n) => n >= 1 && n <= 100, percentMessage),
  duration: z.enum(PROMO_DURATIONS),
});

export function PromoCodes({ canManage, style }: { canManage: boolean; style?: React.CSSProperties }) {
  const t = useT();
  const promos = usePromos();
  const create = useCreatePromo();
  const deactivate = useDeactivatePromo();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(schema, { defaultValues: { code: '', percentOff: '', duration: '3 months' }, mode: 'onSubmit' });
  const errors = form.formState.errors;
  const duration = form.watch('duration');

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    create.mutate(values, {
      onSuccess: (p) => {
        toast(t(`promos.toasts.created.${p.duration}`, { code: p.code, pct: p.percentOff }));
        form.reset();
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  const err = (name: 'code' | 'percentOff', msg: string | undefined) =>
    msg ? { 'aria-invalid': true, 'aria-describedby': `promo-${name}-error` } : {};

  return (
    <section className="card table-scroll" style={style} aria-labelledby="promo-codes">
      <h2 id="promo-codes" className="card-title">
        {t('promos.title')}
      </h2>
      {canManage && (
        <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={t('promos.formLabel')}>
          <div className="hstack wrap" style={{ gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: '1.2 1 140px' }}>
              <input
                className="input"
                style={{ fontWeight: 700, textTransform: 'uppercase' }}
                placeholder={t('promos.codePlaceholder')}
                aria-label={t('promos.codeLabel')}
                autoComplete="off"
                {...err('code', errors.code?.message)}
                {...form.register('code')}
              />
              {errors.code && (
                <div id="promo-code-error" className="field-error" role="alert">
                  {errors.code.message}
                </div>
              )}
            </div>
            <div style={{ flex: '0.7 1 90px' }}>
              <input
                className="input"
                inputMode="numeric"
                placeholder={t('promos.percentPlaceholder')}
                aria-label={t('promos.percentLabel')}
                {...err('percentOff', errors.percentOff?.message)}
                {...form.register('percentOff')}
              />
              {errors.percentOff && (
                <div id="promo-percentOff-error" className="field-error" role="alert">
                  {errors.percentOff.message}
                </div>
              )}
            </div>
            <Select
              label={t('promos.durationLabel')}
              value={duration}
              onChange={(v) => form.setValue('duration', v, { shouldDirty: true })}
              options={PROMO_DURATIONS.map((d) => [d, t(`promos.durations.${d}`)] as const)}
              style={{ flex: '1 1 120px', minWidth: 0 }}
            />
            <button type="submit" className="btn btn--primary" disabled={create.isPending}>
              {create.isPending && <Spinner />} {t('promos.create')}
            </button>
          </div>
          <FormError>{formError}</FormError>
        </form>
      )}

      {promos.isPending ? (
        <SkeletonRows rows={3} h={20} />
      ) : promos.error ? (
        <ErrorState compact error={promos.error} onRetry={() => void promos.refetch()} />
      ) : promos.data.length === 0 ? (
        <Empty>{t('promos.empty')}</Empty>
      ) : (
        <div role="table" aria-label={t('promos.tableLabel')} style={{ marginTop: 8 }}>
          <div role="row" className="trow trow--head" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 8 }}>
            <div role="columnheader">{t('columns.code')}</div>
            <div role="columnheader">{t('columns.discount')}</div>
            <div role="columnheader">{t('columns.duration')}</div>
            <div role="columnheader">{t('columns.audience')}</div>
            <div role="columnheader">{t('columns.usage')}</div>
            <div role="columnheader" className="sr-only">
              {t('columns.actions')}
            </div>
          </div>
          {promos.data.map((p) => (
            <div key={p.id} role="row" className="trow" style={{ gridTemplateColumns: COLS, minWidth: MIN, gap: 8, fontSize: 12.5 }}>
              <div role="cell" className="ellipsis mono" style={{ fontWeight: 800, letterSpacing: '0.02em' }}>
                {p.code}
              </div>
              <div role="cell" className="fg-good" style={{ fontWeight: 700 }}>
                {t('promos.percentOff', { pct: p.percentOff })}
              </div>
              <div role="cell">{t(`promos.durations.${p.duration}`)}</div>
              <div role="cell" className="muted">
                {p.audience}
              </div>
              <div role="cell" className="muted">
                {t('promos.redemptions', { count: p.redemptions })}
              </div>
              <div role="cell" style={{ textAlign: 'right' }}>
                {canManage && (
                  <ConfirmButton
                    className="link"
                    style={{ fontSize: 11.5, color: 'var(--rFg)' }}
                    confirmLabel={t('promos.confirmDeactivate')}
                    pending={deactivate.isPending && deactivate.variables === p.id}
                    onConfirm={() => deactivate.mutate(p.id, { onSuccess: () => toast(t('promos.toasts.deactivated', { code: p.code })) })}
                  >
                    {t('promos.deactivate')}
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
