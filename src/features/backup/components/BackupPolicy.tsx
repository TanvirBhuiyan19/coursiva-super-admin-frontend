import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Badge, Card, ConfirmButton, Field, FormError, Input, Spinner, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useUpdateBackupSettings } from '../api';
import { BACKUP_FREQUENCIES, FREQUENCY_LABELS, type BackupSettings, type BackupSummary } from '../types';

const policySchema = z.object({
  frequency: z.enum(BACKUP_FREQUENCIES),
  nightlyWindow: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Enter the window as HH:MM (24-hour UTC).'),
  retentionDays: z.coerce
    .number({ error: 'Enter a number of days.' })
    .int('Whole days only.')
    .min(7, 'Keep nightly backups for 7 to 365 days.')
    .max(365, 'Keep nightly backups for 7 to 365 days.'),
});
type PolicyIn = z.input<typeof policySchema>;

const valuesOf = (s: BackupSettings): PolicyIn => ({
  frequency: s.frequency,
  nightlyWindow: s.nightlyWindow,
  retentionDays: s.retentionDays,
});

export function BackupPolicy({ settings, summary }: { settings: BackupSettings; summary: BackupSummary }) {
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
        toast(`Backup policy saved — ${FREQUENCY_LABELS[next.frequency].toLowerCase()}, nightly backups kept ${next.retentionDays} days`);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  const toggle = (patch: Partial<BackupSettings>, message: string) =>
    update.mutate(patch, { onSuccess: () => toast(message), onError: (err) => toast(errorMessage(err), 'error') });

  return (
    <Card title="Policy & destinations">
      <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label="Backup policy">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14 }}>
          <Field label="Schedule" error={errs.frequency?.message} style={{ gridColumn: '1 / -1' }}>
            {(p) => (
              <select {...p} {...form.register('frequency')} className="select" disabled={!manage}>
                {BACKUP_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Nightly window (UTC)" error={errs.nightlyWindow?.message}>
            {(p) => <Input {...p} {...form.register('nightlyWindow')} placeholder="03:00" disabled={!manage} autoComplete="off" />}
          </Field>
          <Field label="Keep nightly backups (days)" error={errs.retentionDays?.message} hint="Then weekly copies for 12 months.">
            {(p) => <Input {...p} {...form.register('retentionDays')} type="number" min={7} max={365} disabled={!manage} />}
          </Field>
        </div>
        <FormError>{formError}</FormError>
        {manage && form.formState.isDirty && (
          <div className="hstack" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm" onClick={() => form.reset(valuesOf(settings))}>
              Discard
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={update.isPending}>
              {update.isPending && <Spinner />} Save policy
            </button>
          </div>
        )}
      </form>

      <div style={{ marginTop: 10 }}>
        <ToggleRow
          label="Cross-region replication"
          sub="Every backup copies to a second region within minutes."
          on={settings.replication}
          disabled={!manage || update.isPending}
          onChange={(v) =>
            toggle(
              { replication: v },
              v
                ? 'Cross-region replication on — the replica syncs within minutes'
                : 'Cross-region replication off — backups stay in one region',
            )
          }
        />
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="min0" style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Immutability lock (WORM){' '}
              <Badge xs tone={settings.worm ? 'good' : 'bad'}>
                {settings.worm ? 'Locked' : 'Off'}
              </Badge>
            </div>
            <div className="t-xs muted" style={{ marginTop: 2, lineHeight: 1.45 }}>
              Backups can’t be altered or deleted for 30 days — ransomware protection.
            </div>
          </div>
          {manage &&
            (settings.worm ? (
              <ConfirmButton
                className="btn btn--sm btn--danger"
                confirmLabel="Confirm — remove lock"
                pending={update.isPending}
                onConfirm={() => toggle({ worm: false }, 'Immutability lock disabled — backups can now be altered or deleted')}
              >
                Turn off WORM
              </ConfirmButton>
            ) : (
              <button
                type="button"
                className="btn btn--sm btn--primary"
                disabled={update.isPending}
                onClick={() => toggle({ worm: true }, 'Backups locked immutable for 30 days — ransomware cannot alter them')}
              >
                Turn on WORM
              </button>
            ))}
        </div>
      </div>

      <h3 className="eyebrow" style={{ marginTop: 14, marginBottom: 2 }}>
        Destinations
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
        AES-256 encrypted at rest · keys in the platform KMS · integrity checksums on every snapshot.
      </p>
    </Card>
  );
}
