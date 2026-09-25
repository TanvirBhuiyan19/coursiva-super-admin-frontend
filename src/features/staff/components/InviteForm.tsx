import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useInviteStaff } from '../api';
import { t as tStaff, useT } from '../i18n';
import { ASSIGNABLE_ROLES } from '../types';

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: () => tStaff('invite.validation.email') })),
  role: z.enum(ASSIGNABLE_ROLES, { error: () => tStaff('invite.validation.role') }),
});

export function InviteForm({ onInvited }: { onInvited?: (id: string) => void }) {
  const t = useT();
  const invite = useInviteStaff();
  const form = useZodForm(schema, { defaultValues: { email: '', role: 'Support' } });
  const [formError, setFormError] = useState<string | null>(null);
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    invite.mutate(v, {
      onSuccess: (m) => {
        form.reset({ email: '', role: v.role });
        toast(t('invite.sent', { email: m.email, role: t(`roles.${m.role}`) }));
        onInvited?.(m.id);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate aria-label={t('invite.formLabel')}>
      <div className="hstack wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <Field label={t('invite.emailLabel')} error={errors.email?.message} style={{ width: 280, maxWidth: '100%' }}>
          {(p) => <Input {...p} {...form.register('email')} type="email" placeholder={t('invite.emailPlaceholder')} autoComplete="off" />}
        </Field>
        <Field label={t('invite.roleLabel')} error={errors.role?.message} style={{ display: 'flex', flexDirection: 'column' }}>
          {(p) => (
            <select {...p} {...form.register('role')} className="select" style={{ width: 'auto' }}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button type="submit" className="btn btn--primary" disabled={invite.isPending}>
          {invite.isPending && <Spinner />} {t('invite.send')}
        </button>
      </div>
      <FormError>{formError}</FormError>
    </form>
  );
}
