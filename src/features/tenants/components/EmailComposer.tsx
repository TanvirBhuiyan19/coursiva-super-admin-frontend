import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useEmailOwners } from '../api';

const schema = z.object({
  subject: z.string().trim().min(1, 'Add a subject line.').max(150, 'Keep the subject under 150 characters.'),
  body: z.string().trim().min(1, 'Write a message.'),
});

export function EmailComposer({ ids, onClose, onSent }: { ids: string[]; onClose: () => void; onSent?: () => void }) {
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
          toast(`Email sent to ${sent} owner${sent > 1 ? 's' : ''}`);
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
    <Modal onClose={onClose} width={560} label={`Email ${n} tenant owners`}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <h2 className="display" style={{ fontWeight: 700, fontSize: 16 }}>
            Email {n} tenant owner{n > 1 ? 's' : ''}
          </h2>
          <button type="button" className="close-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <Field label="Subject" error={form.formState.errors.subject?.message}>
          {(p) => <Input {...p} {...form.register('subject')} size="lg" style={{ fontWeight: 600 }} placeholder="Subject…" />}
        </Field>
        <Field label="Message" error={form.formState.errors.body?.message} hint="Merge tags: {owner_name}, {tenant_name}, {plan}">
          {(p) => <Textarea {...p} {...form.register('body')} rows={7} placeholder="Write your message…" />}
        </Field>
        <FormError>{formError}</FormError>
        <div className="hstack wrap" style={{ gap: 10, marginTop: 16 }}>
          <span className="t-xs faint">Sent from platform@coursiva.com · replies go to your inbox</span>
          <div className="spacer" />
          <button type="button" className="btn btn--lg" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="btn btn--primary btn--lg" disabled={send.isPending}>
            {send.isPending && <Spinner />} Send email
          </button>
        </div>
      </form>
    </Modal>
  );
}
