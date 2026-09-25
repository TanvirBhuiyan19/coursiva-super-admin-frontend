import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import {
  Badge,
  Card,
  Empty,
  ErrorState,
  Field,
  FormError,
  Pagination,
  Screen,
  Seg,
  Select,
  SkeletonRows,
  Spinner,
  Textarea,
} from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { formatDate, num, plural } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useAnnouncements, useAudienceReach, useSendAnnouncement } from '../api';
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CHANNELS, ANNOUNCEMENT_MAX_LENGTH, type AnnouncementChannel } from '../types';

const schema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Write the announcement first.')
    .max(ANNOUNCEMENT_MAX_LENGTH, `Keep announcements under ${ANNOUNCEMENT_MAX_LENGTH} characters.`),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  channel: z.enum(ANNOUNCEMENT_CHANNELS),
});

const CHANNEL_HINT: Record<AnnouncementChannel, string> = {
  Banner: 'Shown as a dismissible banner across the tenant admin',
  Email: 'Emailed to every tenant owner',
  'In-app': 'Posted to the tenant admin notification centre',
};

function Composer() {
  const send = useSendAnnouncement();
  const reach = useAudienceReach();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(schema, { defaultValues: { message: '', audience: 'All tenants', channel: 'Banner' } });
  const message = form.watch('message');
  const audience = form.watch('audience');
  const channel = form.watch('channel');
  const tenants = reach.data?.find((r) => r.audience === audience)?.tenants;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    send.mutate(values, {
      onSuccess: (a) => {
        form.reset({ message: '', audience: values.audience, channel: values.channel });
        toast(`Announcement sent to ${a.audience.toLowerCase()} — ${plural(a.recipients, 'tenant')} via ${a.channel.toLowerCase()}`);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <Card title="New announcement">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field
          label="Message"
          error={form.formState.errors.message?.message}
          hint={`${num(message.length)} / ${num(ANNOUNCEMENT_MAX_LENGTH)} characters`}
          style={{ marginTop: 10 }}
        >
          {(p) => (
            <Textarea
              {...p}
              {...form.register('message')}
              rows={3}
              placeholder="Write the announcement…"
              style={{ padding: '11px 12px' }}
            />
          )}
        </Field>
        <div className="hstack wrap" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
          <Field label="Audience" hint={tenants != null ? `Reaches ${plural(tenants, 'tenant')}` : ' '}>
            {(p) => (
              <Controller
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <Select
                    id={p.id}
                    value={field.value}
                    onChange={field.onChange}
                    options={ANNOUNCEMENT_AUDIENCES}
                    style={{ width: 'auto', display: 'block' }}
                  />
                )}
              />
            )}
          </Field>
          <div>
            <div className="field-label" id="announce-channel">
              Channel
            </div>
            <div style={{ width: 250, maxWidth: '100%' }}>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <Seg label="Channel" options={ANNOUNCEMENT_CHANNELS} value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
            <div className="field-hint">{CHANNEL_HINT[channel as AnnouncementChannel]}</div>
          </div>
          <div className="spacer" />
          <button type="submit" className="btn btn--primary btn--lg" disabled={send.isPending} style={{ marginBottom: 18 }}>
            {send.isPending && <Spinner />} Send announcement
          </button>
        </div>
        <FormError>{formError}</FormError>
      </form>
    </Card>
  );
}

export default function AnnouncePage() {
  const [f, setF] = useUrlState({ page: '1' });
  const history = useAnnouncements({ page: Number(f.page) || 1, perPage: 20 });

  return (
    <Screen max={900} label="Announcements">
      <Composer />
      <Card title="History">
        {history.error ? (
          <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
        ) : history.isPending ? (
          <SkeletonRows rows={4} />
        ) : history.data.data.length === 0 ? (
          <Empty>No announcements sent yet.</Empty>
        ) : (
          <ol className="stack plain-list" aria-label="Sent announcements" style={{ marginTop: 6 }}>
            {history.data.data.map((a) => (
              <li key={a.id} className="row wrap" style={{ padding: '12px 0' }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                  {a.message}
                </span>
                <Badge tone="accent" style={{ fontSize: 11 }}>
                  {a.audience}
                </Badge>
                <Badge tone="flat" style={{ fontSize: 11 }}>
                  {a.channel}
                </Badge>
                <span
                  className="faint"
                  style={{ width: 130, textAlign: 'right', fontSize: 11.5, flexShrink: 0 }}
                  title={`Sent by ${a.sentBy}`}
                >
                  Sent · {formatDate(a.sentAt)}
                  <br />
                  {plural(a.recipients, 'tenant')}
                </span>
              </li>
            ))}
          </ol>
        )}
        {history.data && history.data.meta.lastPage > 1 && (
          <Pagination meta={history.data.meta} noun="announcements" onPage={(p) => setF({ page: String(p) })} />
        )}
      </Card>
    </Screen>
  );
}
