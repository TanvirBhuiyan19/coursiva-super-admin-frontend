import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Card, Field, FormError, Input, Seg, Spinner, ToggleRow, UnsavedChangesGuard } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { PLANS } from '@/lib/domain';
import { useT as useCommonT } from '@/lib/i18n/common';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useUpdatePlatformSettings } from '../api';
import { t as translate, useT } from '../i18n';
import { IDLE_LOCK_MINUTES, SESSION_HOURS, type PlatformSettings } from '../types';

type ValidationKey = Extract<Parameters<typeof translate>[0], `validation.${string}`>;
// Messages resolve when validation runs, so they follow the current locale.
const msg = (key: ValidationKey) => ({ error: () => translate(key) });
const num = (key: ValidationKey) => z.number(msg(key));

const schema = z.object({
  supportEmail: z
    .string()
    .trim()
    .pipe(z.email(msg('validation.supportEmail'))),
  primaryDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, msg('validation.domain')),
  trialDays: num('validation.trialRequired')
    .int(msg('validation.wholeDays'))
    .min(7, msg('validation.trialRange'))
    .max(60, msg('validation.trialRange')),
  defaultPlan: z.enum(PLANS),
  dunningRetries: num('validation.retries').int().min(1).max(5),
  autoSuspend: z.boolean(),
  requireStaffTwoFactor: z.boolean(),
  enforceSso: z.boolean(),
  sessionHours: num('validation.sessionTimeout').refine(
    (v) => (SESSION_HOURS as readonly number[]).includes(v),
    msg('validation.sessionTimeout'),
  ),
  idleLockMinutes: num('validation.idleLock').refine(
    (v) => (IDLE_LOCK_MINUTES as readonly number[]).includes(v),
    msg('validation.idleLock'),
  ),
  weeklyDigest: z.boolean(),
  billingAlerts: z.boolean(),
  incidentAlerts: z.boolean(),
});

type Values = z.infer<typeof schema>;
type BoolKey = { [K in keyof Values]: Values[K] extends boolean ? K : never }[keyof Values];

const pick = (s: PlatformSettings): Values => ({
  supportEmail: s.supportEmail,
  primaryDomain: s.primaryDomain,
  trialDays: s.trialDays,
  defaultPlan: s.defaultPlan,
  dunningRetries: s.dunningRetries,
  autoSuspend: s.autoSuspend,
  requireStaffTwoFactor: s.requireStaffTwoFactor,
  enforceSso: s.enforceSso,
  sessionHours: s.sessionHours,
  idleLockMinutes: s.idleLockMinutes,
  weeklyDigest: s.weeklyDigest,
  billingAlerts: s.billingAlerts,
  incidentAlerts: s.incidentAlerts,
});

/** Shared platform settings (`GET/PATCH /settings`): one form with dirty tracking, Save / Discard and inline 422s. */
export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const manage = can('platform.manage');
  const save = useUpdatePlatformSettings();
  const form = useZodForm(schema, { defaultValues: pick(settings) });
  const [formError, setFormError] = useState<string | null>(null);
  const { errors, dirtyFields, isDirty } = form.formState;
  const dirtyCount = Object.keys(dirtyFields).length;
  const values = form.watch();

  // Pick up changes saved by someone else, unless there are unsaved edits here.
  useEffect(() => {
    if (!isDirty) form.reset(pick(settings));
  }, [settings, isDirty, form]);

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    const changed = (Object.keys(dirtyFields) as (keyof Values)[]).filter((k) => dirtyFields[k]);
    const patch = Object.fromEntries(changed.map((k) => [k, v[k]])) as Partial<Values>;
    save.mutate(patch, {
      onSuccess: (next) => {
        form.reset(pick(next));
        toast(t('platform.saved', { count: changed.length }));
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  const toggle = (key: BoolKey, label: string, sub: string) => (
    <ToggleRow label={label} sub={sub} on={values[key]} disabled={!manage} onChange={(v) => form.setValue(key, v, { shouldDirty: true })} />
  );

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={t('platform.label')} className="stack" style={{ gap: 16 }}>
      <fieldset disabled={!manage} className="stack" style={{ gap: 16, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend className="sr-only">{t('platform.label')}</legend>
        <Card title={t('platform.identity')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            <Field label={t('platform.supportEmail')} error={errors.supportEmail?.message}>
              {(p) => <Input {...p} {...form.register('supportEmail')} type="email" autoComplete="off" />}
            </Field>
            <Field label={t('platform.primaryDomain')} error={errors.primaryDomain?.message}>
              {(p) => <Input {...p} {...form.register('primaryDomain')} autoComplete="off" spellCheck={false} />}
            </Field>
          </div>
          <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            {t('platform.domainNote')}
          </p>
        </Card>

        <Card title={t('platform.defaults')}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
              gap: 14,
              alignItems: 'start',
            }}
          >
            <div>
              <div className="field-label" id="default-plan-label">
                {t('platform.defaultPlan')}
              </div>
              <Seg
                label={t('platform.defaultPlan')}
                options={PLANS.map((p) => [p, tc(`enums.plan.${p}`)] as const)}
                value={values.defaultPlan}
                disabled={!manage}
                onChange={(v) => form.setValue('defaultPlan', v, { shouldDirty: true })}
              />
            </div>
            <Field label={t('platform.trialLength')} error={errors.trialDays?.message} hint={t('platform.trialHint')}>
              {(p) => <Input {...p} {...form.register('trialDays', { valueAsNumber: true })} type="number" min={7} max={60} />}
            </Field>
            <Field label={t('platform.retries')} error={errors.dunningRetries?.message}>
              {(p) => (
                <select {...p} {...form.register('dunningRetries', { valueAsNumber: true })} className="select">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {t('platform.retryCount', { count: n })}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div style={{ marginTop: 6 }}>{toggle('autoSuspend', t('platform.autoSuspend'), t('platform.autoSuspendSub'))}</div>
        </Card>

        <Card title={t('platform.security')}>
          <div>
            {toggle('requireStaffTwoFactor', t('platform.require2fa'), t('platform.require2faSub'))}
            {toggle('enforceSso', t('platform.enforceSso'), t('platform.enforceSsoSub'))}
          </div>
          <div className="hstack wrap" style={{ gap: 14, paddingTop: 12 }}>
            <div className="min0" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('platform.sessionTimeout')}</div>
              <div className="t-xs muted" style={{ marginTop: 2 }}>
                {t('platform.sessionTimeoutSub')}
              </div>
            </div>
            <select
              {...form.register('sessionHours', { valueAsNumber: true })}
              className="select"
              aria-label={t('platform.sessionTimeout')}
              style={{ width: 'auto' }}
            >
              {SESSION_HOURS.map((h) => (
                <option key={h} value={h}>
                  {t('platform.hours', { count: h })}
                </option>
              ))}
            </select>
          </div>
          {errors.sessionHours && (
            <div className="field-error" role="alert">
              {errors.sessionHours.message}
            </div>
          )}
          <div className="hstack wrap" style={{ gap: 14, paddingTop: 12 }}>
            <div className="min0" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('platform.idleLock')}</div>
              <div className="t-xs muted" style={{ marginTop: 2 }}>
                {t('platform.idleLockSub')}
              </div>
            </div>
            <select
              {...form.register('idleLockMinutes', { valueAsNumber: true })}
              className="select"
              aria-label={t('platform.idleLock')}
              style={{ width: 'auto' }}
            >
              {IDLE_LOCK_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {t('platform.minutes', { count: m })}
                </option>
              ))}
            </select>
          </div>
          {errors.idleLockMinutes && (
            <div className="field-error" role="alert">
              {errors.idleLockMinutes.message}
            </div>
          )}
        </Card>

        <Card title={t('platform.notifications')}>
          {toggle('weeklyDigest', t('platform.weeklyDigest'), t('platform.weeklyDigestSub'))}
          {toggle('billingAlerts', t('platform.billingAlerts'), t('platform.billingAlertsSub'))}
          {toggle('incidentAlerts', t('platform.incidentAlerts'), t('platform.incidentAlertsSub'))}
        </Card>
      </fieldset>

      <FormError>{formError}</FormError>
      {manage ? (
        <div
          className="card card--tight hstack wrap"
          style={{
            ...(isDirty ? { position: 'sticky' as const, bottom: 12, zIndex: 2 } : {}),
            gap: 10,
            boxShadow: isDirty ? 'var(--shPop)' : undefined,
          }}
          role="region"
          aria-label={t('platform.saveRegion')}
        >
          <span className="t-sm" style={{ flex: 1, minWidth: 160, fontWeight: isDirty ? 700 : 400 }} aria-live="polite">
            {isDirty ? t('platform.unsaved', { count: dirtyCount }) : t('platform.allSaved')}
          </span>
          <button
            type="button"
            className="btn"
            disabled={!isDirty || save.isPending}
            onClick={() => {
              form.reset(pick(settings));
              setFormError(null);
            }}
          >
            {t('platform.discard')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!isDirty || save.isPending}>
            {save.isPending && <Spinner />} {tc('actions.saveChanges')}
          </button>
        </div>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          {t('platform.readOnly')}
        </p>
      )}
      <UnsavedChangesGuard when={manage && isDirty && !save.isPending} />
    </form>
  );
}
