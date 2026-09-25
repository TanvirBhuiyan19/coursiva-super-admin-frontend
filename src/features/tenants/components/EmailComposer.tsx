import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useEmailOwners } from '../api';
import { t as msg, useT } from '../i18n';

const schema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, { error: () => msg('email.errors.subjectRequired') })
    .max(150, { error: () => msg('email.errors.subjectMax') }),
  body: z
    .string()
    .trim()
    .min(1, { error: () => msg('email.errors.bodyRequired') }),
});

export function EmailComposer({ ids, onClose, onSent }: { ids: string[]; onClose: () => void; onSent?: () => void }) {
  const t = useT();
  const tc = useCommonT();
  const send = useEmailOwners();
  const form = useZodForm(schema, { defaultValues: { subject: '', body: '' } });
  const [formError, setFormError] = useState<string | null>(null);
  const n = ids.length;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    send.mutate(
      { ids, ...values },
      {
        onSuccess: ({ sent }) => {
          toast(t('email.sent', { count: sent }));
          onSent?.();
          onClose();
        },
        onError: (err) => {
          if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
        },
      },
    );
  });

  return (
    <Modal onClose={onClose} width={560} label={t('email.title', { count: n })}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <h2 className="display" style={{ fontWeight: 700, fontSize: 16 }}>
            {t('email.title', { count: n })}
          </h2>
          <button type="button" className="close-x" onClick={onClose} aria-label={tc('actions.close')}>
            ×
          </button>
        </div>
        <Field label={t('email.subject')} error={form.formState.errors.subject?.message}>
          {(p) => (
            <Input {...p} {...form.register('subject')} size="lg" style={{ fontWeight: 600 }} placeholder={t('email.subjectPlaceholder')} />
          )}
        </Field>
        <Field
          label={t('email.message')}
          error={form.formState.errors.body?.message}
          hint={t('email.mergeTags', { tags: '{owner_name}, {tenant_name}, {plan}' })}
        >
          {(p) => <Textarea {...p} {...form.register('body')} rows={7} placeholder={t('email.messagePlaceholder')} />}
        </Field>
        <FormError>{formError}</FormError>
        <div className="hstack wrap" style={{ gap: 10, marginTop: 16 }}>
          <span className="t-xs faint">{t('email.footer')}</span>
          <div className="spacer" />
          <button type="button" className="btn btn--lg" onClick={onClose}>
            {t('email.discard')}
          </button>
          <button type="submit" className="btn btn--primary btn--lg" disabled={send.isPending}>
            {send.isPending && <Spinner />} {t('email.send')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
