import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Badge, Card, ConfirmButton, Field, FormError, Input, Spinner, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useUpdateBackupSettings } from '../api';
import { t as tStatic, useT } from '../i18n';
import { BACKUP_FREQUENCIES, type BackupSettings, type BackupSummary } from '../types';

const policySchema = z.object({
  frequency: z.enum(BACKUP_FREQUENCIES),
  nightlyWindow: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: () => tStatic('policy.windowFormat') }),
  retentionDays: z.coerce
    .number({ error: () => tStatic('policy.daysNumber') })
    .int({ error: () => tStatic('policy.wholeDays') })
    .min(7, { error: () => tStatic('policy.daysRange') })
    .max(365, { error: () => tStatic('policy.daysRange') }),
});
type PolicyIn = z.input<typeof policySchema>;

const valuesOf = (s: BackupSettings): PolicyIn => ({
  frequency: s.frequency,
  nightlyWindow: s.nightlyWindow,
  retentionDays: s.retentionDays,
});

export function BackupPolicy({ settings, summary }: { settings: BackupSettings; summary: BackupSummary }) {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateBackupSettings();
  const form = useZodForm(policySchema, { defaultValues: valuesOf(settings) });
  const [formError, setFormError] = useState<string | null>(null);
  const errs = form.formState.errors;

  // Keep the form in sync with the server copy after a save elsewhere, unless the user is mid-edit.
  const { isDirty } = form.formState;
  useEffect(() => {
    if (!isDirty) form.reset(valuesOf(settings));
  }, [settings, isDirty, form]);

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    update.mutate(v, {
      onSuccess: (next) => {
        form.reset(valuesOf(next));
        toast(t('policy.saved', { frequency: t(`enums.frequencyInline.${next.frequency}`), days: next.retentionDays }));
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  const toggle = (patch: Partial<BackupSettings>, message: string) =>
    update.mutate(patch, { onSuccess: () => toast(message), onError: (err) => toast(errorMessage(err), 'error') });

  return (
    <Card title={t('policy.title')}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={t('policy.formLabel')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14 }}>
          <Field label={t('policy.schedule')} error={errs.frequency?.message} style={{ gridColumn: '1 / -1' }}>
            {(p) => (
              <select {...p} {...form.register('frequency')} className="select" disabled={!manage}>
                {BACKUP_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {t(`enums.frequency.${f}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('policy.nightlyWindow')} error={errs.nightlyWindow?.message}>
            {(p) => <Input {...p} {...form.register('nightlyWindow')} placeholder="03:00" disabled={!manage} autoComplete="off" />}
          </Field>
          <Field label={t('policy.keepDays')} error={errs.retentionDays?.message} hint={t('policy.keepHint')}>
            {(p) => <Input {...p} {...form.register('retentionDays')} type="number" min={7} max={365} disabled={!manage} />}
          </Field>
        </div>
        <FormError>{formError}</FormError>
        {manage && form.formState.isDirty && (
          <div className="hstack" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm" onClick={() => form.reset(valuesOf(settings))}>
              {t('policy.discard')}
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={update.isPending}>
              {update.isPending && <Spinner />} {t('policy.save')}
            </button>
          </div>
        )}
      </form>

      <div style={{ marginTop: 10 }}>
        <ToggleRow
          label={t('policy.replication')}
          sub={t('policy.replicationSub')}
          on={settings.replication}
          disabled={!manage || update.isPending}
          onChange={(v) => toggle({ replication: v }, v ? t('policy.replicationOn') : t('policy.replicationOff'))}
        />
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="min0" style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {t('policy.worm')}{' '}
              <Badge xs tone={settings.worm ? 'good' : 'bad'}>
                {settings.worm ? t('policy.locked') : t('policy.off')}
              </Badge>
            </div>
            <div className="t-xs muted" style={{ marginTop: 2, lineHeight: 1.45 }}>
              {t('policy.wormSub')}
            </div>
          </div>
          {manage &&
            (settings.worm ? (
              <ConfirmButton
                className="btn btn--sm btn--danger"
                confirmLabel={t('policy.confirmRemoveLock')}
                pending={update.isPending}
                onConfirm={() => toggle({ worm: false }, t('policy.wormDisabled'))}
              >
                {t('policy.turnOffWorm')}
              </ConfirmButton>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--primary"
                disabled={update.isPending}
                onClick={() => toggle({ worm: true }, t('policy.wormEnabled'))}
              >
                {t('policy.turnOnWorm')}
              </button>
            ))}
        </div>
      </div>

      <h3 className="eyebrow" style={{ marginTop: 14, marginBottom: 2 }}>
        {t('policy.destinations')}
      </h3>
      <ul className="plain-list">
        {summary.destinations.map((d) => (
          <li key={d.id} className="row wrap" style={{ gap: 10, padding: '9px 0', fontSize: 12.5 }}>
            <span className="min0" style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
              {d.name}
            </span>
            <span className="muted nowrap">{d.size}</span>
            <span className={d.healthy ? 'fg-good' : 'fg-warn'} style={{ fontSize: 11.5, fontWeight: 700 }}>
              {d.status}
            </span>
          </li>
        ))}
      </ul>
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        {t('policy.encryption')}
      </p>
    </Card>
  );
}
