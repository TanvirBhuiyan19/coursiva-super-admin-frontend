import { useState } from 'react';
import { z } from 'zod';
import { Card, Dot, Empty, ErrorState, Field, FormError, Input, Select, SkeletonRows, Spinner, Toggle } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { errorMessage } from '@/lib/api/errors';
import { plural, timeAgo } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useFeatureFlags, usePostIncident, useResolveIncident, useSystemStatus, useUpdateFlag } from '../api';
import { useAnnouncements, useSendAnnouncement } from '@/features/announcements/api';
import { ANNOUNCEMENT_AUDIENCES } from '@/features/announcements/types';
import { FLAG_ROLLOUTS, type FeatureFlag, type SystemStatus } from '../types';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ---------- Feature flags ----------
export function FlagsCard() {
  const can = useCan();
  const flags = useFeatureFlags();
  const update = useUpdateFlag();
  const canManage = can('flags.manage');

  const toggle = (f: FeatureFlag) =>
    update.mutate(
      { key: f.key, enabled: !f.enabled },
      { onSuccess: (n) => toast(`${n.name} ${n.enabled ? 'enabled' : 'disabled'} for ${n.rollout.toLowerCase()}`) },
    );
  const setRollout = (f: FeatureFlag, rollout: FeatureFlag['rollout']) =>
    update.mutate({ key: f.key, rollout }, { onSuccess: (n) => toast(`${n.name} now rolls out to ${n.rollout.toLowerCase()}`) });

  return (
    <Card title="Feature flags" right={!canManage && <span className="card-sub">View only</span>}>
      {flags.isPending ? (
        <SkeletonRows rows={5} h={24} />
      ) : flags.error ? (
        <ErrorState compact error={flags.error} onRetry={() => void flags.refetch()} />
      ) : flags.data.length === 0 ? (
        <Empty>No feature flags defined.</Empty>
      ) : (
        <ul className="plain-list">
          {flags.data.map((f) => (
            <li key={f.key} className="row wrap" style={{ gap: 14, padding: '13px 0' }}>
              <div className="min0" style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.name}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {f.description}
                  {f.tenantOverrides > 0 && <span className="faint"> · {plural(f.tenantOverrides, 'tenant override')}</span>}
                </div>
              </div>
              <Select
                value={f.rollout}
                onChange={(v) => setRollout(f, v)}
                options={FLAG_ROLLOUTS}
                label={`${f.name} rollout`}
                disabled={!canManage}
                style={{ width: 'auto', padding: '6px 9px', fontSize: 12, fontWeight: 600, borderRadius: 7 }}
              />
              <Toggle on={f.enabled} onChange={() => toggle(f)} label={f.name} disabled={!canManage} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- System status ----------
const incidentSchema = z.object({
  title: z.string().trim().min(5, 'Describe the incident in at least 5 characters.').max(120, 'Keep the title under 120 characters.'),
  serviceIds: z.array(z.string()).min(1, 'Pick at least one affected service.'),
});

function IncidentForm({ status, onDone }: { status: SystemStatus; onDone: () => void }) {
  const post = usePostIncident();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(incidentSchema, { defaultValues: { title: 'Elevated video processing delays', serviceIds: ['video'] } });
  const submit = form.handleSubmit((values) => {
    setFormError(null);
    post.mutate(values, {
      onSuccess: () => {
        toast('Incident posted — the status page and every tenant dashboard now show it');
        onDone();
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });
  const svcError = form.formState.errors.serviceIds?.message;
  return (
    <form
      className="card card--inset"
      style={{ marginBottom: 12, marginTop: 4 }}
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label="Post an incident"
    >
      <Field label="Incident title" error={form.formState.errors.title?.message}>
        {(p) => <Input {...p} {...form.register('title')} placeholder="e.g. Elevated video processing delays" />}
      </Field>
      <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }} aria-describedby={svcError ? 'incident-svc-err' : undefined}>
        <legend className="field-label">Affected services</legend>
        <div className="hstack wrap" style={{ gap: 14 }}>
          {status.services.map((s) => (
            <label key={s.id} className="hstack t-sm" style={{ gap: 6 }}>
              <input type="checkbox" className="checkbox" value={s.id} {...form.register('serviceIds')} />
              {s.name}
            </label>
          ))}
        </div>
        {svcError && (
          <div id="incident-svc-err" className="field-error" role="alert">
            {svcError}
          </div>
        )}
      </fieldset>
      <FormError>{formError}</FormError>
      <div className="hstack" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--sm" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm btn--danger" disabled={post.isPending}>
          {post.isPending && <Spinner />} Post to status page
        </button>
      </div>
    </form>
  );
}

export function SystemStatusCard() {
  const can = useCan();
  const status = useSystemStatus();
  const resolve = useResolveIncident();
  const [composing, setComposing] = useState(false);
  const s = status.data;
  const canManage = can('flags.manage');

  const action =
    s && canManage ? (
      s.incident ? (
        <button
          type="button"
          className="btn btn--sm"
          disabled={resolve.isPending}
          onClick={() =>
            resolve.mutate(undefined, { onSuccess: () => toast('Incident resolved — status page shows all systems operational') })
          }
        >
          {resolve.isPending && <Spinner />} Resolve incident
        </button>
      ) : (
        !composing && (
          <button type="button" className="btn btn--sm" onClick={() => setComposing(true)}>
            Post incident
          </button>
        )
      )
    ) : null;

  return (
    <Card
      title="System status"
      right={
        <div className="hstack" style={{ gap: 12 }}>
          {s && (
            <a className="link" href={s.statusPageUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              Public status page <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          {action}
        </div>
      }
    >
      {status.isPending ? (
        <SkeletonRows rows={4} h={20} />
      ) : status.error ? (
        <ErrorState compact error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <>
          {status.data.incident && (
            <div className="callout callout--bad" role="status" style={{ marginBottom: 12, marginTop: 4, fontWeight: 600 }}>
              <span aria-hidden="true">⚠</span>
              <span style={{ flex: 1 }}>
                Incident posted {timeAgo(status.data.incident.postedAt)}: {lower(status.data.incident.title)}. Tenants see this banner on
                their status page.
              </span>
            </div>
          )}
          {composing && !status.data.incident && <IncidentForm status={status.data} onDone={() => setComposing(false)} />}
          <ul className="plain-list">
            {status.data.services.map((sv) => {
              const tone = sv.status === 'Degraded' ? 'warn' : 'good';
              return (
                <li key={sv.id} className="row wrap">
                  <Dot tone={tone} size={9} />
                  <span style={{ fontWeight: 600, flex: 1, minWidth: 170 }}>{sv.name}</span>
                  <span className="muted t-sm">{sv.uptime90d.toFixed(2)}% uptime · 90d</span>
                  <span
                    className={tone === 'good' ? 'fg-good' : 'fg-warn'}
                    style={{ fontSize: 11.5, fontWeight: 700, minWidth: 76, textAlign: 'right' }}
                  >
                    {sv.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---------- Broadcast ----------
const broadcastSchema = z.object({
  message: z.string().trim().min(1, 'Write the announcement.').max(200, 'Keep it under 200 characters — it shows as a one-line banner.'),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
});

const sbField = { border: '1px solid var(--sbB2)', background: 'var(--sbH)', color: 'var(--sbTx)', padding: '9px 12px' } as const;

export function BroadcastPanel() {
  // Banners are announcements on the Banner channel — one history, owned by the Announcements feature.
  const send = useSendAnnouncement();
  const recent = useAnnouncements({ perPage: 3 });
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(broadcastSchema, { defaultValues: { message: '', audience: 'All tenants' } });
  const audience = form.watch('audience');
  const msgError = form.formState.errors.message?.message;

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    send.mutate(
      { ...values, channel: 'Banner' },
      {
        onSuccess: (b) => {
          toast(`Announcement sent to ${b.audience.toLowerCase()} — shows on ${plural(b.recipients, 'tenant dashboard')}`);
          form.reset({ message: '', audience: values.audience });
        },
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <section
      aria-labelledby="broadcast-title"
      style={{ background: 'var(--sb)', border: '1px solid var(--sbEdge)', borderRadius: 12, padding: 20, color: 'var(--sbTx)' }}
    >
      <h2 id="broadcast-title" className="card-title" style={{ color: 'var(--onAc)' }}>
        Broadcast announcement
      </h2>
      <p style={{ fontSize: 12.5, color: 'var(--sbTx2)', margin: '3px 0 0' }}>
        Shows as a dismissible banner in every tenant admin dashboard.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate className="hstack wrap" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="input"
            {...form.register('message')}
            aria-label="Announcement message"
            aria-invalid={msgError ? true : undefined}
            aria-describedby={msgError ? 'broadcast-err' : undefined}
            placeholder="e.g. New: AI outline assistant is live for all tenants"
            style={{ ...sbField, width: '100%' }}
          />
          {msgError && (
            <div id="broadcast-err" className="callout callout--bad" role="alert" style={{ marginTop: 6, padding: '6px 10px' }}>
              {msgError}
            </div>
          )}
        </div>
        <Select
          value={audience}
          onChange={(v) => form.setValue('audience', v, { shouldDirty: true })}
          options={ANNOUNCEMENT_AUDIENCES}
          label="Audience"
          style={{ ...sbField, width: 'auto', padding: '9px 10px' }}
        />
        <button type="submit" className="btn btn--primary" style={{ padding: '9px 16px', fontSize: 13 }} disabled={send.isPending}>
          {send.isPending && <Spinner />} Send
        </button>
      </form>
      {formError && (
        <div role="alert" className="callout callout--bad" style={{ marginTop: 8, padding: '6px 10px' }}>
          {formError}
        </div>
      )}
      {recent.data && recent.data.data.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--sbB)', paddingTop: 10 }}>
          <h3 className="eyebrow" style={{ color: 'var(--sbTx2)', margin: '0 0 4px' }}>
            Recently sent
          </h3>
          <ul className="plain-list">
            {recent.data.data.map((b) => (
              <li key={b.id} style={{ fontSize: 12.5, padding: '6px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200, color: 'var(--sbTx)' }}>“{b.message}”</span>
                <span style={{ color: 'var(--sbTx2)', fontSize: 11.5 }}>
                  {b.channel} · {b.audience} · {b.sentBy} · <time dateTime={b.sentAt}>{timeAgo(b.sentAt)}</time>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
