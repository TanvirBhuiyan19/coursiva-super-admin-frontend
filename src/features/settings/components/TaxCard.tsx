import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Card, ConfirmButton, Empty, Field, FormError, Input, QueryState, SkeletonRows, Spinner, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useRemoveTaxRegion, useTaxSettings, useUpdateTaxSettings } from '../api';
import { t as translate, useT } from '../i18n';
import type { TaxSettings } from '../types';

const numberingSchema = (min: number) =>
  z.object({
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,8}$/, { error: () => translate('numberingValidation.invoicePrefix') }),
    nextInvoiceNumber: z
      .number({ error: () => translate('numberingValidation.nextNumberRequired') })
      .int({ error: () => translate('numberingValidation.wholeNumbers') })
      // An invoice number, not a quantity: passed as a string so it isn't digit-grouped.
      .min(min, { error: () => translate('numberingValidation.nextNumberMin', { min: String(min) }) })
      .max(999_999, { error: () => translate('numberingValidation.nextNumberMax') }),
  });

function Numbering({ tax, manage }: { tax: TaxSettings; manage: boolean }) {
  const t = useT();
  const update = useUpdateTaxSettings();
  const form = useZodForm(numberingSchema(tax.minNextInvoiceNumber), {
    defaultValues: { invoicePrefix: tax.invoicePrefix, nextInvoiceNumber: tax.nextInvoiceNumber },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, isDirty } = form.formState;
  const prefix = form.watch('invoicePrefix');
  const next = form.watch('nextInvoiceNumber');
  const preview = prefix.trim().toUpperCase() + (Number.isFinite(next) ? String(next).padStart(6, '0') : '······');

  useEffect(() => {
    if (!isDirty) form.reset({ invoicePrefix: tax.invoicePrefix, nextInvoiceNumber: tax.nextInvoiceNumber });
  }, [tax.invoicePrefix, tax.nextInvoiceNumber, isDirty, form]);

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    update.mutate(v, {
      onSuccess: (saved) => {
        form.reset({ invoicePrefix: saved.invoicePrefix, nextInvoiceNumber: saved.nextInvoiceNumber });
        toast(t('tax.numberingSaved', { preview: saved.nextInvoicePreview }));
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={t('tax.numbering')} style={{ marginTop: 14 }}>
      <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Field label={t('tax.prefix')} error={errors.invoicePrefix?.message} style={{ width: 130 }}>
          {(p) => <Input {...p} {...form.register('invoicePrefix')} disabled={!manage} autoComplete="off" />}
        </Field>
        <Field label={t('tax.nextNumber')} error={errors.nextInvoiceNumber?.message} style={{ width: 200 }}>
          {(p) => <Input {...p} {...form.register('nextInvoiceNumber', { valueAsNumber: true })} type="number" disabled={!manage} />}
        </Field>
        <div className="t-sm muted" style={{ paddingTop: 36, flex: 1, minWidth: 200 }}>
          {t('tax.nextInvoice')} <b style={{ color: 'var(--tx)' }}>{preview}</b> {t('tax.nextInvoiceNote')}
        </div>
      </div>
      <FormError>{formError}</FormError>
      {manage && isDirty && (
        <div className="hstack" style={{ gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => form.reset({ invoicePrefix: tax.invoicePrefix, nextInvoiceNumber: tax.nextInvoiceNumber })}
          >
            {t('tax.discard')}
          </button>
          <button type="submit" className="btn btn--sm btn--primary" disabled={update.isPending}>
            {update.isPending && <Spinner />} {t('tax.saveNumbering')}
          </button>
        </div>
      )}
    </form>
  );
}

export function TaxCard() {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const q = useTaxSettings();
  const update = useUpdateTaxSettings();
  const remove = useRemoveTaxRegion();
  const toggle = (patch: { stripeTax?: boolean; taxInclusive?: boolean }, message: string) =>
    update.mutate(patch, { onSuccess: () => toast(message), onError: (err) => toast(errorMessage(err), 'error') });

  return (
    <Card title={t('tax.title')}>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={6} />}>
        {(tax) => (
          <>
            <ToggleRow
              label={t('tax.stripeTax')}
              sub={t('tax.stripeTaxSub')}
              on={tax.stripeTax}
              disabled={!manage}
              onChange={(v) => toggle({ stripeTax: v }, t(v ? 'tax.stripeTaxOn' : 'tax.stripeTaxOff'))}
            />
            <ToggleRow
              label={t('tax.inclusive')}
              sub={t('tax.inclusiveSub')}
              on={tax.taxInclusive}
              disabled={!manage}
              onChange={(v) => toggle({ taxInclusive: v }, t(v ? 'tax.inclusiveOn' : 'tax.inclusiveOff'))}
            />
            <h3 className="eyebrow" style={{ marginTop: 14, marginBottom: 2 }}>
              {t('tax.regions')}
            </h3>
            {tax.regions.length === 0 ? (
              <Empty>{t('tax.noRegions')}</Empty>
            ) : (
              <ul className="plain-list" aria-label={t('tax.regionsLabel')}>
                {tax.regions.map((r) => (
                  <li key={r.id} className="row wrap" style={{ padding: '9px 0', fontSize: 12.5 }}>
                    <span className="min0" style={{ fontWeight: 600, flex: 1, minWidth: 140 }}>
                      {r.region}
                    </span>
                    <span className="muted">{r.kind}</span>
                    <span style={{ fontWeight: 700, width: 64, textAlign: 'right' }}>{r.rate}</span>
                    {manage && (
                      <ConfirmButton
                        className="btn btn--sm btn--danger"
                        confirmLabel={
                          <>
                            {t('tax.confirmRemove')} <span className="sr-only">{r.region}</span>
                          </>
                        }
                        pending={remove.isPending && remove.variables === r.id}
                        onConfirm={() =>
                          remove.mutate(r.id, { onSuccess: () => toast(t('tax.removed', { region: r.region, kind: r.kind })) })
                        }
                      >
                        {t('tax.remove')} <span className="sr-only">{r.region}</span>
                      </ConfirmButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Numbering tax={tax} manage={manage} />
          </>
        )}
      </QueryState>
    </Card>
  );
}
