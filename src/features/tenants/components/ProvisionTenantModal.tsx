import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Seg, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { PLANS } from '@/lib/domain';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast, useUi } from '@/store/ui';
import { useState } from 'react';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useProvisionTenant } from '../api';
import { t as msg, useT } from '../i18n';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: () => msg('provision.errors.nameMin') })
    .max(80, { error: () => msg('provision.errors.nameMax') }),
  ownerEmail: z.email({ error: () => msg('provision.errors.email') }),
  plan: z.enum(PLANS),
});

export function ProvisionTenantModal() {
  const t = useT();
  const tc = useCommonT();
  const navigate = useNavigate();
  const close = () => useUi.getState().set({ provisionOpen: false });
  const provision = useProvisionTenant();
  const form = useZodForm(schema, { defaultValues: { name: '', ownerEmail: '', plan: 'Launch' } });
  const [formError, setFormError] = useState<string | null>(null);
  const name = form.watch('name');
  const plan = form.watch('plan');
  const slug =
    (name.trim()
      ? name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')
          .slice(0, 24)
      : 'yourschool') + '.coursiva.io';

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    provision.mutate(values, {
      onSuccess: (tenant) => {
        close();
        toast(t('provision.provisioned', { email: values.ownerEmail }));
        void navigate(`/tenants/${tenant.id}`);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <Modal onClose={close} label={t('provision.title')}>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <h2 className="modal-title">{t('provision.title')}</h2>
        <p className="t-sm muted" style={{ marginTop: 3, marginBottom: 0 }}>
          {t('provision.intro')}
        </p>
        <Field label={t('provision.schoolName')} error={form.formState.errors.name?.message}>
          {(p) => (
            <Input {...p} {...form.register('name')} size="lg" placeholder={t('provision.schoolPlaceholder')} autoComplete="organization" />
          )}
        </Field>
        <Field label={t('provision.ownerEmail')} error={form.formState.errors.ownerEmail?.message}>
          {(p) => (
            <Input
              {...p}
              {...form.register('ownerEmail')}
              size="lg"
              type="email"
              placeholder={t('provision.ownerPlaceholder')}
              autoComplete="email"
            />
          )}
        </Field>
        <div
          className="hstack t-sm"
          style={{ marginTop: 12, background: 'var(--pg)', border: '1px solid var(--bd2)', borderRadius: 9, padding: '9px 12px' }}
        >
          <span className="muted">{t('provision.subdomain')}</span>
          <span className="mono ellipsis" style={{ fontWeight: 700 }}>
            {slug}
          </span>
          <span className="fg-good" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
            {t('provision.autoSsl')}
          </span>
        </div>
        <div className="field-label" id="prov-plan">
          {t('provision.plan')}
        </div>
        <Seg
          label={t('provision.plan')}
          options={PLANS.map((p) => [p, tc(`enums.plan.${p}`)] as const)}
          value={plan}
          onChange={(v) => form.setValue('plan', v, { shouldDirty: true })}
        />
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          {t('provision.trialNote')}
        </p>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={close}>
            {tc('actions.cancel')}
          </button>
          <button type="submit" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} disabled={provision.isPending}>
            {provision.isPending && <Spinner />} {t('provision.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
