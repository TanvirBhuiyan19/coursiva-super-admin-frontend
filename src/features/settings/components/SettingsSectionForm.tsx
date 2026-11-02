import { useEffect, useState } from 'react';
import type { Path, UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { pathOf } from '@/app/screens';
import {
  Badge,
  Card,
  ConfirmButton,
  ConfirmDialog,
  FormError,
  Input,
  Seg,
  Spinner,
  Textarea,
  Toggle,
  UnsavedChangesGuard,
} from '@/components/ui';
import { SettingRow, WhereRead, type SettingControlProps } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import { usePlatformConnections } from '@/features/platform/api';
import { useTenants } from '@/features/tenants/api';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useResetSettingsSection, useSendTestEmail, useUpdatePlatformSettings } from '../api';
import { currencySymbol, formatMinor } from '../currency';
import { useT } from '../i18n';
import type { PlatformSettings, SettingKey, SettingMeta, SettingsSection } from '../types';
import { changedFromDefault, sectionSchema, sectionValues, SECTION_FIELDS, toWire, type FieldSpec, type FormValues } from './sectionConfig';

interface Props {
  section: SettingsSection;
  settings: PlatformSettings;
  meta: readonly SettingMeta[] | undefined;
  manage: boolean;
  /** Reports unsaved edits so the page can warn before switching sections. */
  onDirtyChange: (dirty: boolean) => void;
}

/** Laravel reports list items as `field.3`; show those on the list field itself. */
function listErrorsOnField(err: unknown) {
  if (!(err instanceof ApiError) || !err.isValidation) return err;
  const fields: Record<string, string[]> = {};
  for (const [name, msgs] of Object.entries(err.fieldErrors)) fields[name.replace(/\.\d+$/, '')] ??= msgs;
  return new ApiError(err.status, err.message, fields, err.code);
}

/** One `PlatformSettings` section: its own form (Save sends only changed fields), Restore defaults and where the values are read. */
export function SettingsSectionForm({ section, settings, meta, manage, onDirtyChange }: Props) {
  const t = useT();
  const fields = SECTION_FIELDS[section];
  const save = useUpdatePlatformSettings();
  const reset = useResetSettingsSection();
  const form = useZodForm(sectionSchema(section), { defaultValues: sectionValues(section, settings) });
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, dirtyFields, isDirty } = form.formState;
  const dirtyKeys = (Object.keys(dirtyFields) as SettingKey[]).filter((k) => dirtyFields[k]);
  const changed = changedFromDefault(settings, meta, section);
  const sectionLabel = t(`sections.${section}.label`);
  const pending = save.isPending || reset.isPending;

  // Pick up changes saved elsewhere (another tab, Restore defaults), unless there are unsaved edits here.
  useEffect(() => {
    if (!isDirty) form.reset(sectionValues(section, settings));
  }, [settings, isDirty, form, section]);

  useEffect(() => {
    onDirtyChange(manage && isDirty);
  }, [manage, isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // Switching maintenance on takes every school offline: it names the impact and asks for a typed confirmation first.
  const [confirmMaintenance, setConfirmMaintenance] = useState<{ patch: Record<string, unknown>; exempt: number } | null>(null);
  const send = (patch: Record<string, unknown>) =>
    save.mutate(patch, {
      onSuccess: (next) => {
        setConfirmMaintenance(null);
        form.reset(sectionValues(section, next));
        toast(t('section.saved', { section: sectionLabel, count: dirtyKeys.length }));
      },
      onError: (err) => {
        setConfirmMaintenance(null);
        if (!applyServerErrors(form, listErrorsOnField(err))) setFormError(errorMessage(err));
      },
    });
  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    const patch = Object.fromEntries(dirtyKeys.map((k) => [k, toWire(k, v[k])]));
    if (section === 'maintenance' && v.maintenanceMode && !settings.maintenanceMode) {
      setConfirmMaintenance({ patch, exempt: v.maintenanceExemptTenants.length });
      return;
    }
    send(patch);
  });

  const errorOf = (key: SettingKey) => errors[key as keyof typeof errors]?.message;

  return (
    <>
      {section === 'maintenance' && settings.maintenanceMode && (
        <div className="callout callout--warn" role="status">
          {t('options.maintenanceOn')}
        </div>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={sectionLabel}>
        <Card
          title={sectionLabel}
          right={changed.length > 0 ? <Badge tone="accent">{t('section.changed', { count: changed.length })}</Badge> : undefined}
        >
          <p className="t-sm muted" style={{ margin: '-4px 0 4px' }}>
            {t(`sections.${section}.blurb`)}
          </p>
          <fieldset disabled={!manage} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="sr-only">{sectionLabel}</legend>
            {fields.map((f) => (
              <SettingRow
                key={f.key}
                label={t(`fields.${f.key}.label`)}
                help={t(`fields.${f.key}.help`)}
                error={errorOf(f.key)}
                changed={changed.includes(f.key)}
                kind={f.kind === 'toggle' || f.kind === 'seg' || f.kind === 'tenants' || f.kind === 'provider' ? 'group' : 'field'}
              >
                {(p) => <Control spec={f} p={p} form={form} manage={manage} currency={settings.billingCurrency || 'USD'} />}
              </SettingRow>
            ))}
          </fieldset>
          <FormError>{formError}</FormError>
          {manage && (
            <div className="hstack wrap" style={{ gap: 8, paddingTop: 14, borderTop: '1px solid var(--bd2)' }}>
              <button type="submit" className="btn btn--primary" disabled={!isDirty || pending}>
                {save.isPending && <Spinner />} {t('section.save', { section: sectionLabel.toLowerCase() })}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!isDirty || pending}
                onClick={() => {
                  form.reset(sectionValues(section, settings));
                  setFormError(null);
                }}
              >
                {t('section.discard')}
              </button>
              {section === 'email' && <TestEmailButton />}
              <span className="t-xs muted" aria-live="polite" style={{ marginLeft: 4 }}>
                {isDirty ? t('section.unsaved', { count: dirtyKeys.length }) : null}
              </span>
              <span className="spacer" />
              {changed.length > 0 && (
                <ConfirmButton
                  className="btn btn--ghost"
                  confirmLabel={t('section.confirmRestore')}
                  pending={reset.isPending}
                  disabled={save.isPending}
                  onConfirm={() =>
                    reset.mutate(section, {
                      onSuccess: (next) => {
                        form.reset(sectionValues(section, next));
                        setFormError(null);
                        toast(t('section.restored', { section: sectionLabel.toLowerCase() }));
                      },
                    })
                  }
                >
                  {t('section.restoreDefaults')}
                </ConfirmButton>
              )}
            </div>
          )}
          {manage && section === 'email' && (
            <p className="note" style={{ margin: '8px 0 0' }}>
              {t('email.testNote')}
            </p>
          )}
        </Card>
        <UnsavedChangesGuard when={manage && isDirty && !save.isPending} />
      </form>
      {confirmMaintenance && (
        <ConfirmDialog
          title={t('options.maintenanceConfirm.title')}
          phrase={t('options.maintenanceConfirm.phrase')}
          confirmLabel={t('options.maintenanceConfirm.action')}
          pending={save.isPending}
          onConfirm={() => send(confirmMaintenance.patch)}
          onCancel={() => setConfirmMaintenance(null)}
        >
          <MaintenanceReach exempt={confirmMaintenance.exempt} />
        </ConfirmDialog>
      )}
      <WhereRead
        summary={t('section.whereRead')}
        items={(meta ?? [])
          .filter((m) => m.section === section)
          .map((m) => ({ key: m.key, label: t(`fields.${m.key}.label`), effect: m.effect }))}
      />
    </>
  );
}

/** How many schools maintenance takes offline (all schools minus the exempt ones), when the viewer can list schools. */
function MaintenanceReach({ exempt }: { exempt: number }) {
  const t = useT();
  const can = useCan();
  return can('tenants.view') ? <KnownReach exempt={exempt} /> : <>{t('options.maintenanceConfirm.reachUnknown')}</>;
}

function KnownReach({ exempt }: { exempt: number }) {
  const t = useT();
  const total = useTenants({ perPage: 1 }).data?.meta.total;
  if (total == null) return <>{t('options.maintenanceConfirm.reachUnknown')}</>;
  return (
    <>
      {t('options.maintenanceConfirm.reach', { count: Math.max(0, total - exempt) })}
      {exempt > 0 && <> {t('options.maintenanceConfirm.exempt', { count: exempt })}</>}
    </>
  );
}

type Form = UseFormReturn<FormValues, unknown, FormValues>;

function Control({
  spec,
  p,
  form,
  manage,
  currency,
}: {
  spec: FieldSpec;
  p: SettingControlProps;
  form: Form;
  manage: boolean;
  /** The platform billing currency (`money` fields). */
  currency: string;
}) {
  const t = useT();
  const key = spec.key as Path<FormValues>;
  const label = t(`fields.${spec.key}.label`);
  const set = (v: unknown) => form.setValue(key, v as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  const { labelId: _labelId, ...inputProps } = p;
  switch (spec.kind) {
    case 'text':
    case 'email':
    case 'url':
      return (
        <Input
          {...inputProps}
          {...form.register(key)}
          type={spec.kind}
          placeholder={spec.placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{ width: 280 }}
        />
      );
    case 'textarea':
    case 'lines':
      return (
        <Textarea
          {...inputProps}
          {...form.register(key)}
          rows={spec.kind === 'lines' ? 5 : 3}
          placeholder={spec.placeholder}
          spellCheck={spec.kind === 'textarea'}
          style={{ width: 280 }}
        />
      );
    case 'number':
      return (
        <Input
          {...inputProps}
          {...form.register(key, { valueAsNumber: true })}
          type="number"
          min={spec.min}
          max={spec.max}
          style={{ width: 120 }}
        />
      );
    case 'money': {
      const range = t('options.moneyRange', {
        min: formatMinor(spec.min ?? 0, currency),
        max: formatMinor(spec.max ?? 0, currency),
        currency,
      });
      return (
        <div className="hstack wrap" style={{ gap: 6 }}>
          <span className="muted" aria-hidden="true">
            {currencySymbol(currency)}
          </span>
          <Input
            {...inputProps}
            {...form.register(key, { valueAsNumber: true })}
            type="number"
            inputMode="decimal"
            step={0.01}
            min={spec.min === undefined ? undefined : spec.min / 100}
            max={spec.max === undefined ? undefined : spec.max / 100}
            style={{ width: 100 }}
          />
          <span className="t-xs muted">{range}</span>
        </div>
      );
    }
    case 'select':
      return (
        <select {...inputProps} {...form.register(key, { valueAsNumber: true })} className="select" style={{ width: 'auto' }}>
          {spec.options?.().map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      );
    case 'seg':
      return (
        <Seg
          label={label}
          options={(spec.options?.() ?? []).map(([v, text]) => [String(v), text] as const)}
          value={String(form.watch(key))}
          disabled={!manage}
          onChange={set}
        />
      );
    case 'toggle':
      return <Toggle label={label} on={form.watch(key) === true} disabled={!manage || spec.unavailable === true} onChange={set} />;
    case 'color': {
      const value = String(form.watch(key));
      return (
        <div className="hstack" style={{ gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: '1px solid var(--bd)',
              background: /^#[0-9a-f]{6}$/i.test(value) ? value : 'transparent',
              flexShrink: 0,
            }}
          />
          <Input {...inputProps} {...form.register(key)} autoComplete="off" spellCheck={false} style={{ width: 120 }} className="mono" />
        </div>
      );
    }
    case 'provider':
      return (
        <BillingProviderPicker
          label={label}
          options={(spec.options?.() ?? []).map(([v, text]) => [String(v), text] as const)}
          value={String(form.watch(key))}
          manage={manage}
          onChange={set}
        />
      );
    case 'tenants':
      return <TenantPicker labelId={p.labelId} value={form.watch(key) as string[]} disabled={!manage} onChange={set} />;
  }
}

/**
 * Stripe, Paddle or Lemon Squeezy. Merchants of record must be connected first: the picker names the ones that aren't
 * (the server refuses them with a 422 shown on the field). Changing it also needs billing.manage (403 otherwise).
 */
function BillingProviderPicker({
  label,
  options,
  value,
  manage,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value: string;
  manage: boolean;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const can = useCan();
  const billing = can('billing.manage');
  const connections = usePlatformConnections();
  const missing = options
    .filter(([v]) => v !== 'stripe' && connections.data?.some((c) => c.key === v && !c.connected))
    .map(([, text]) => text);
  const [first = '', second = ''] = missing;
  return (
    <div style={{ maxWidth: 360 }}>
      <Seg label={label} options={options} value={value} disabled={!manage || !billing} onChange={onChange} />
      {manage && !billing ? (
        <div className="t-xs muted" style={{ marginTop: 6 }}>
          {t('options.providerNeedsBilling')}
        </div>
      ) : (
        missing.length > 0 && (
          <div className="t-xs muted" style={{ marginTop: 6 }}>
            {t('options.providersNotConnected', {
              count: missing.length,
              names: missing.length > 1 ? t('options.and', { first, second }) : first,
            })}{' '}
            <Link to={pathOf('connections')} className="link">
              {t('options.connectionsLink')}
            </Link>
          </div>
        )
      )}
    </div>
  );
}

function TenantPicker({
  labelId,
  value,
  disabled,
  onChange,
}: {
  labelId: string;
  value: string[];
  disabled: boolean;
  onChange: (v: string[]) => void;
}) {
  const t = useT();
  const list = useTenants({ perPage: 100, sort: 'name' });
  const tenants = list.data?.data ?? [];
  return (
    <div style={{ width: 280 }}>
      <div
        role="group"
        aria-labelledby={labelId}
        className="card card--inset"
        style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 10px' }}
      >
        {list.isPending ? (
          <Spinner />
        ) : tenants.length === 0 ? (
          <p className="t-sm muted">{t('options.noTenants')}</p>
        ) : (
          <ul className="plain-list">
            {tenants.map((tn) => (
              <li key={tn.id}>
                <label className="hstack t-sm" style={{ gap: 8, padding: '6px 0', cursor: disabled ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={value.includes(tn.id)}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.checked ? [...value, tn.id] : value.filter((id) => id !== tn.id))}
                  />
                  <span className="min0 ellipsis">{tn.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="t-xs muted" style={{ marginTop: 4 }}>
        {t('options.exemptCount', { count: value.length })}
      </div>
    </div>
  );
}

function TestEmailButton() {
  const t = useT();
  const send = useSendTestEmail();
  return (
    <button
      type="button"
      className="btn"
      disabled={send.isPending}
      onClick={() => send.mutate(undefined, { onSuccess: (r) => toast(t('email.testSent', { address: r.sentTo })) })}
    >
      {send.isPending && <Spinner />} {t('email.test')}
    </button>
  );
}
