import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useInviteStaff } from '../api';
import { ASSIGNABLE_ROLES } from '../types';

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid work email address.')),
  role: z.enum(ASSIGNABLE_ROLES, { error: 'Choose a role.' }),
});

export function InviteForm({ onInvited }: { onInvited?: (id: string) => void }) {
  const invite = useInviteStaff();
  const form = useZodForm(schema, { defaultValues: { email: '', role: 'Support' } });
  const [formError, setFormError] = useState<string | null>(null);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    invite.mutate(v, {
      onSuccess: (m) => {
        form.reset({ email: '', role: v.role });
        toast(`Invite sent to ${m.email} as ${m.role} — the link expires in 7 days`);
        onInvited?.(m.id);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label="Invite staff">
      <div className="hstack wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <Field label="Invite email" error={errors.email?.message} style={{ width: 280, maxWidth: '100%' }}>
          {(p) => <Input {...p} {...form.register('email')} type="email" placeholder="colleague@coursiva.io" autoComplete="off" />}
        </Field>
        <Field label="Role" error={errors.role?.message} style={{ display: 'flex', flexDirection: 'column' }}>
          {(p) => (
            <select {...p} {...form.register('role')} className="select" style={{ width: 'auto' }}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button type="submit" className="btn btn--primary" disabled={invite.isPending}>
          {invite.isPending && <Spinner />} Send invite
        </button>
      </div>
      <FormError>{formError}</FormError>
    </form>
  );
}
