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
import { formatDate } from '@/lib/format';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useAnnouncements, useAudienceReach, useSendAnnouncement } from '../api';
import { t as msg, useT } from '../i18n';
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_CHANNELS, ANNOUNCEMENT_MAX_LENGTH, type AnnouncementChannel } from '../types';

const schema = z.object({
  message: z
    .string()
    .trim()
    .min(1, { error: () => msg('composer.errors.required') })
    .max(ANNOUNCEMENT_MAX_LENGTH, { error: () => msg('composer.errors.max', { max: ANNOUNCEMENT_MAX_LENGTH }) }),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  channel: z.enum(ANNOUNCEMENT_CHANNELS),
});

function Composer() {
  const t = useT();
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
        toast(
          t('composer.sent', {
            count: a.recipients,
            audience: t(`audiencesInline.${a.audience}`),
            channel: t(`channelsInline.${a.channel}`),
          }),
        );
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <Card title={t('composer.title')}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field
          label={t('composer.message')}
          error={form.formState.errors.message?.message}
          hint={t('composer.characters', { count: message.length, max: ANNOUNCEMENT_MAX_LENGTH })}
          style={{ marginTop: 10 }}
        >
          {(p) => (
            <Textarea
              {...p}
              {...form.register('message')}
              rows={3}
              placeholder={t('composer.placeholder')}
              style={{ padding: '11px 12px' }}
            />
          )}
        </Field>
        <div className="hstack wrap" style={{ gap: 16, marginTop: 12, alignItems: 'flex-end' }}>
          <Field label={t('composer.audience')} hint={tenants != null ? t('composer.reaches', { count: tenants }) : ' '}>
            {(p) => (
              <Controller
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <Select
                    id={p.id}
                    value={field.value}
                    onChange={field.onChange}
                    options={ANNOUNCEMENT_AUDIENCES.map((x) => [x, t(`audiences.${x}`)] as const)}
                    style={{ width: 'auto', display: 'block' }}
                  />
                )}
              />
            )}
          </Field>
          <div>
            <div className="field-label" id="announce-channel">
              {t('composer.channel')}
            </div>
            <div style={{ width: 250, maxWidth: '100%' }}>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <Seg
                    label={t('composer.channel')}
                    options={ANNOUNCEMENT_CHANNELS.map((x) => [x, t(`channels.${x}`)] as const)}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="field-hint">{t(`composer.channelHints.${channel as AnnouncementChannel}`)}</div>
          </div>
          <div className="spacer" />
          <button type="submit" className="btn btn--primary btn--lg" disabled={send.isPending} style={{ marginBottom: 18 }}>
            {send.isPending && <Spinner />} {t('composer.send')}
          </button>
        </div>
        <FormError>{formError}</FormError>
      </form>
    </Card>
  );
}

export default function AnnouncePage() {
  const t = useT();
  const [f, setF] = useUrlState({ page: '1' });
  const history = useAnnouncements({ page: Number(f.page) || 1, perPage: 20 });

  return (
    <Screen max={900} label={t('title')}>
      <Composer />
      <Card title={t('history.title')}>
        {history.error ? (
          <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
        ) : history.isPending ? (
          <SkeletonRows rows={4} />
        ) : history.data.data.length === 0 ? (
          <Empty>{t('history.empty')}</Empty>
        ) : (
          <ol className="stack plain-list" aria-label={t('history.label')} style={{ marginTop: 6 }}>
            {history.data.data.map((a) => (
              <li key={a.id} className="row wrap" style={{ padding: '12px 0' }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13, fontWeight: 500, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                  {a.message}
                </span>
                <Badge tone="accent" style={{ fontSize: 11 }}>
                  {t(`audiences.${a.audience}`)}
                </Badge>
                <Badge tone="flat" style={{ fontSize: 11 }}>
                  {t(`channels.${a.channel}`)}
                </Badge>
                <span
                  className="faint"
                  style={{ width: 130, textAlign: 'right', fontSize: 11.5, flexShrink: 0 }}
                  title={t('history.sentBy', { name: a.sentBy })}
                >
                  {t('history.sentOn', { date: formatDate(a.sentAt) })}
                  <br />
                  {t('history.recipients', { count: a.recipients })}
                </span>
              </li>
            ))}
          </ol>
        )}
        {history.data && history.data.meta.lastPage > 1 && (
          <Pagination meta={history.data.meta} noun={t('history.noun')} onPage={(p) => setF({ page: String(p) })} />
        )}
      </Card>
    </Screen>
  );
}
