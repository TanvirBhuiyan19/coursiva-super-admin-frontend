import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Card,
  ConfirmButton,
  Empty,
  Field,
  FormError,
  Input,
  Modal,
  QueryState,
  Select,
  SkeletonRows,
  Spinner,
  ToggleRow,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useAddTaxRegistration, useRemoveTaxRegion, useTaxSettings, useUpdateTaxSettings } from '../api';
import { t as translate, useT } from '../i18n';
import { TAX_REGISTRATION_TYPES, type TaxSettings } from '../types';

const PROVIDER_LABEL: Record<string, string> = { paddle: 'Paddle', lemon_squeezy: 'Lemon Squeezy' };

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
  // As both backends number invoices: prefix + the plain number (INV-1002), never zero-padded.
  const preview = prefix.trim().toUpperCase() + (Number.isFinite(next) ? String(next) : '······');

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

function AddRegistration({ onClose }: { onClose: () => void }) {
  const t = useT();
  const add = useAddTaxRegistration();
  const [country, setCountry] = useState('');
  const [type, setType] = useState<(typeof TAX_REGISTRATION_TYPES)[number]>('standard');
  const [activeFrom, setActiveFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    setError(null);
    if (!/^[A-Za-z]{2}$/.test(country.trim())) {
      setError(t('tax.countryInvalid'));
      return;
    }
    add.mutate(
      { country: country.trim().toUpperCase(), type, ...(activeFrom ? { activeFrom } : {}) },
      {
        onSuccess: () => {
          toast(t('tax.added', { country: country.trim().toUpperCase() }));
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Modal onClose={onClose} label={t('tax.addTitle')}>
      <form
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 className="modal-title">{t('tax.addTitle')}</h2>
        <Field label={t('tax.country')} hint={t('tax.countryHint')}>
          {(p) => (
            <Input
              {...p}
              value={country}
              maxLength={2}
              autoComplete="off"
              onChange={(e) => setCountry(e.target.value)}
              style={{ width: 90 }}
            />
          )}
        </Field>
        <Field label={t('tax.type')}>
          {(p) => (
            <Select
              id={p.id}
              value={type}
              onChange={setType}
              options={TAX_REGISTRATION_TYPES.map((k) => [k, k] as const)}
              style={{ width: '100%' }}
            />
          )}
        </Field>
        <Field label={t('tax.activeFromField')} hint={t('tax.activeFromHint')}>
          {(p) => <Input {...p} type="date" value={activeFrom} onChange={(e) => setActiveFrom(e.target.value)} style={{ width: 180 }} />}
        </Field>
        <FormError>{error}</FormError>
        <div className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>
            {t('tax.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={add.isPending}>
            {add.isPending && <Spinner />} {t('tax.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaxCard() {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const q = useTaxSettings();
  const update = useUpdateTaxSettings();
  const remove = useRemoveTaxRegion();
  const [adding, setAdding] = useState(false);
  const toggle = (patch: { stripeTax?: boolean; taxInclusive?: boolean }, message: string) =>
    update.mutate(patch, { onSuccess: () => toast(message), onError: (err) => toast(errorMessage(err), 'error') });

  return (
    <Card title={t('tax.title')}>
      <QueryState query={q} compact skeleton={<SkeletonRows rows={6} />}>
        {(tax) => {
          const mor = tax.handledBy !== null;
          return (
            <>
              {mor && (
                <div className="callout" role="status" style={{ marginBottom: 10 }}>
                  {t('tax.handledBy', { provider: PROVIDER_LABEL[tax.handledBy ?? ''] ?? tax.handledBy ?? '' })}
                </div>
              )}
              <ToggleRow
                label={t('tax.stripeTax')}
                sub={t('tax.stripeTaxSub')}
                on={tax.stripeTax}
                disabled={!manage || mor}
                onChange={(v) => toggle({ stripeTax: v }, t(v ? 'tax.stripeTaxOn' : 'tax.stripeTaxOff'))}
              />
              <ToggleRow
                label={t('tax.inclusive')}
                sub={t('tax.inclusiveSub')}
                on={tax.taxInclusive}
                disabled={!manage || mor}
                onChange={(v) => toggle({ taxInclusive: v }, t(v ? 'tax.inclusiveOn' : 'tax.inclusiveOff'))}
              />
              <div className="hstack" style={{ marginTop: 14, marginBottom: 2, justifyContent: 'space-between', gap: 8 }}>
                <h3 className="eyebrow" style={{ margin: 0 }}>
                  {t('tax.regions')}
                </h3>
                {manage && !mor && tax.registrationsAvailable && (
                  <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
                    {t('tax.add')}
                  </button>
                )}
              </div>
              {mor ? null : !tax.registrationsAvailable ? (
                <Empty>{t('tax.unavailable')}</Empty>
              ) : tax.regions.length === 0 ? (
                <Empty>{t('tax.noRegions')}</Empty>
              ) : (
                <ul className="plain-list" aria-label={t('tax.regionsLabel')}>
                  {tax.regions.map((r) => (
                    <li key={r.id} className="row wrap" style={{ padding: '9px 0', fontSize: 12.5 }}>
                      <span className="min0" style={{ fontWeight: 600, flex: 1, minWidth: 140 }}>
                        {r.region}
                      </span>
                      <span className="muted mono">{r.kind}</span>
                      <span className="faint" style={{ minWidth: 110, textAlign: 'right' }}>
                        {r.expiresAt
                          ? t('tax.expires', { date: formatDate(r.expiresAt) })
                          : r.activeFrom
                            ? t('tax.activeFrom', { date: formatDate(r.activeFrom) })
                            : r.status}
                      </span>
                      {manage && (
                        <ConfirmButton
                          className="btn btn--sm btn--danger"
                          confirmLabel={
                            <>
                              {t('tax.confirmRemove')} <span className="sr-only">{r.region}</span>
                            </>
                          }
                          pending={remove.isPending && remove.variables === r.id}
                          onConfirm={() => remove.mutate(r.id, { onSuccess: () => toast(t('tax.removed', { region: r.region })) })}
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
          );
        }}
      </QueryState>
      {adding && <AddRegistration onClose={() => setAdding(false)} />}
    </Card>
  );
}
