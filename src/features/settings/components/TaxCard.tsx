import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Card, ConfirmButton, Empty, Field, FormError, Input, QueryState, SkeletonRows, Spinner, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useRemoveTaxRegion, useTaxSettings, useUpdateTaxSettings } from '../api';
import type { TaxSettings } from '../types';

const numberingSchema = (min: number) =>
  z.object({
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,8}$/, 'Use 1–8 capital letters, digits or dashes.'),
    nextInvoiceNumber: z
      .number({ error: 'Enter the next invoice number.' })
      .int('Whole numbers only.')
      .min(min, `Numbering is sequential and gap-free — the next number must be at least ${min}.`)
      .max(999_999, 'Enter a whole number up to 999999.'),
  });

function Numbering({ tax, manage }: { tax: TaxSettings; manage: boolean }) {
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
      onSuccess: (t) => {
        form.reset({ invoicePrefix: t.invoicePrefix, nextInvoiceNumber: t.nextInvoiceNumber });
        toast(`Invoice numbering saved — the next invoice is ${t.nextInvoicePreview}`);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label="Invoice numbering" style={{ marginTop: 14 }}>
      <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <Field label="Invoice prefix" error={errors.invoicePrefix?.message} style={{ width: 130 }}>
          {(p) => <Input {...p} {...form.register('invoicePrefix')} disabled={!manage} autoComplete="off" />}
        </Field>
        <Field label="Next number" error={errors.nextInvoiceNumber?.message} style={{ width: 200 }}>
          {(p) => <Input {...p} {...form.register('nextInvoiceNumber', { valueAsNumber: true })} type="number" disabled={!manage} />}
        </Field>
        <div className="t-sm muted" style={{ paddingTop: 36, flex: 1, minWidth: 200 }}>
          Next invoice: <b style={{ color: 'var(--tx)' }}>{preview}</b> · sequential, gap-free numbering for audits
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
            Discard
          </button>
          <button type="submit" className="btn btn--sm btn--primary" disabled={update.isPending}>
            {update.isPending && <Spinner />} Save numbering
          </button>
        </div>
      )}
    </form>
  );
}

export function TaxCard() {
  const can = useCan();
  const manage = can('platform.manage');
  const q = useTaxSettings();
  const update = useUpdateTaxSettings();
  const remove = useRemoveTaxRegion();
  const toggle = (patch: { stripeTax?: boolean; taxInclusive?: boolean }, message: string) =>
    update.mutate(patch, { onSuccess: () => toast(message), onError: (err) => toast(errorMessage(err), 'error') });

  return (
    <Card title="Tax & invoicing">
      <QueryState query={q} compact skeleton={<SkeletonRows rows={6} />}>
        {(tax) => (
          <>
            <ToggleRow
              label="Stripe Tax"
              sub="Auto-calculates the right rate per buyer location at checkout."
              on={tax.stripeTax}
              disabled={!manage}
              onChange={(v) =>
                toggle({ stripeTax: v }, v ? 'Stripe Tax on — rates auto-calculated at checkout' : 'Stripe Tax off — using manual rates')
              }
            />
            <ToggleRow
              label="Tax-inclusive pricing"
              sub="Show prices with tax included (common in the EU)."
              on={tax.taxInclusive}
              disabled={!manage}
              onChange={(v) =>
                toggle(
                  { taxInclusive: v },
                  v ? 'Tax-inclusive pricing on — storefront prices now include tax' : 'Tax-inclusive pricing off — tax added at checkout',
                )
              }
            />
            <h3 className="eyebrow" style={{ marginTop: 14, marginBottom: 2 }}>
              Registered regions
            </h3>
            {tax.regions.length === 0 ? (
              <Empty>No tax registrations — checkout collects no tax.</Empty>
            ) : (
              <ul className="plain-list" aria-label="Registered tax regions">
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
                            Confirm remove <span className="sr-only">{r.region}</span>
                          </>
                        }
                        pending={remove.isPending && remove.variables === r.id}
                        onConfirm={() =>
                          remove.mutate(r.id, { onSuccess: () => toast(`${r.region} removed — checkout stops collecting ${r.kind} there`) })
                        }
                      >
                        Remove <span className="sr-only">{r.region}</span>
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
