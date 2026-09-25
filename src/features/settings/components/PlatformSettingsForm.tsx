import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Card, Field, FormError, Input, Seg, Spinner, ToggleRow, UnsavedChangesGuard } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { PLANS } from '@/lib/domain';
import { plural } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useUpdatePlatformSettings } from '../api';
import { IDLE_LOCK_MINUTES, SESSION_HOURS, type PlatformSettings } from '../types';

const num = (msg: string) => z.number({ error: msg });

const schema = z.object({
  supportEmail: z.string().trim().pipe(z.email('Enter a valid support email address.')),
  primaryDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'Enter a domain like coursiva.io.'),
  trialDays: num('Enter the trial length in days.')
    .int('Whole days only.')
    .min(7, 'The trial length must be between 7 and 60 days.')
    .max(60, 'The trial length must be between 7 and 60 days.'),
  defaultPlan: z.enum(PLANS),
  dunningRetries: num('Choose how many retries.').int().min(1).max(5),
  autoSuspend: z.boolean(),
  requireStaffTwoFactor: z.boolean(),
  enforceSso: z.boolean(),
  sessionHours: num('Choose a session timeout.').refine(
    (v) => (SESSION_HOURS as readonly number[]).includes(v),
    'Choose a session timeout.',
  ),
  idleLockMinutes: num('Choose an idle lock.').refine((v) => (IDLE_LOCK_MINUTES as readonly number[]).includes(v), 'Choose an idle lock.'),
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
        toast(`Platform settings saved — ${plural(changed.length, 'change')} applied for every staff member and new tenant`);
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
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label="Platform settings" className="stack" style={{ gap: 16 }}>
      <fieldset disabled={!manage} className="stack" style={{ gap: 16, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <legend className="sr-only">Platform settings</legend>
        <Card title="Platform identity">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            <Field label="Support email" error={errors.supportEmail?.message}>
              {(p) => <Input {...p} {...form.register('supportEmail')} type="email" autoComplete="off" />}
            </Field>
            <Field label="Primary domain" error={errors.primaryDomain?.message}>
              {(p) => <Input {...p} {...form.register('primaryDomain')} autoComplete="off" spellCheck={false} />}
            </Field>
          </div>
          <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            New tenants get a subdomain under the primary domain until they connect a custom one.
          </p>
        </Card>

        <Card title="New tenant defaults">
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
                Default plan
              </div>
              <Seg
                label="Default plan"
                options={PLANS}
                value={values.defaultPlan}
                disabled={!manage}
                onChange={(v) => form.setValue('defaultPlan', v, { shouldDirty: true })}
              />
            </div>
            <Field label="Trial length (days)" error={errors.trialDays?.message} hint="7–60 days">
              {(p) => <Input {...p} {...form.register('trialDays', { valueAsNumber: true })} type="number" min={7} max={60} />}
            </Field>
            <Field label="Payment retries before suspension" error={errors.dunningRetries?.message}>
              {(p) => (
                <select {...p} {...form.register('dunningRetries', { valueAsNumber: true })} className="select">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {plural(n, 'retry', 'retries')}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div style={{ marginTop: 6 }}>
            {toggle('autoSuspend', 'Auto-suspend after failed dunning', 'Suspend tenant access once all payment retries are exhausted.')}
          </div>
        </Card>

        <Card title="Security">
          <div>
            {toggle(
              'requireStaffTwoFactor',
              'Require 2FA for platform staff',
              'All staff accounts must enroll a second factor to sign in.',
            )}
            {toggle('enforceSso', 'Enforce SSO', 'Staff sign-in is only allowed through the identity provider.')}
          </div>
          <div className="hstack wrap" style={{ gap: 14, paddingTop: 12 }}>
            <div className="min0" style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Session timeout</div>
              <div className="t-xs muted" style={{ marginTop: 2 }}>
                Staff must sign in again after this long, however active they are.
              </div>
            </div>
            <select
              {...form.register('sessionHours', { valueAsNumber: true })}
              className="select"
              aria-label="Session timeout"
              style={{ width: 'auto' }}
            >
              {SESSION_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h} hours
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>Idle lock</div>
              <div className="t-xs muted" style={{ marginTop: 2 }}>
                The console locks after this long without activity; staff re-enter their password to continue.
              </div>
            </div>
            <select
              {...form.register('idleLockMinutes', { valueAsNumber: true })}
              className="select"
              aria-label="Idle lock"
              style={{ width: 'auto' }}
            >
              {IDLE_LOCK_MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
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

        <Card title="Notifications">
          {toggle('weeklyDigest', 'Weekly platform digest', 'MRR, signups and churn summary every Monday.')}
          {toggle('billingAlerts', 'Billing alerts', 'Failed charges, disputes and dunning outcomes.')}
          {toggle('incidentAlerts', 'Incident alerts', 'Status page incidents and degraded-performance events.')}
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
          aria-label="Save platform settings"
        >
          <span className="t-sm" style={{ flex: 1, minWidth: 160, fontWeight: isDirty ? 700 : 400 }} aria-live="polite">
            {isDirty ? plural(dirtyCount, 'unsaved change') : 'All changes saved'}
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
            Discard
          </button>
          <button type="submit" className="btn btn--primary" disabled={!isDirty || save.isPending}>
            {save.isPending && <Spinner />} Save changes
          </button>
        </div>
      ) : (
        <p className="note" style={{ margin: 0 }}>
          You can view platform settings. Changing them needs the “Manage platform settings” permission.
        </p>
      )}
      <UnsavedChangesGuard when={manage && isDirty && !save.isPending} />
    </form>
  );
}
