import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Seg, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { PLANS } from '@/lib/domain';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast, useUi } from '@/store/ui';
import { useState } from 'react';
import { useProvisionTenant } from '../api';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the school name (2+ characters).').max(80, 'Keep it under 80 characters.'),
  ownerEmail: z.email('Enter a valid email address.'),
  plan: z.enum(PLANS),
});

export function ProvisionTenantModal() {
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
        toast(`Tenant provisioned — invite sent to ${values.ownerEmail}`);
        void navigate(`/tenants/${tenant.id}`);
      },
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  return (
    <Modal onClose={close} label="Provision a new tenant">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <h2 className="modal-title">Provision a new tenant</h2>
        <p className="t-sm muted" style={{ marginTop: 3, marginBottom: 0 }}>
          Creates the workspace, subdomain and owner invite in one step.
        </p>
        <Field label="School name" error={form.formState.errors.name?.message}>
          {(p) => <Input {...p} {...form.register('name')} size="lg" placeholder="e.g. Harbor Music School" autoComplete="organization" />}
        </Field>
        <Field label="Owner email" error={form.formState.errors.ownerEmail?.message}>
          {(p) => (
            <Input {...p} {...form.register('ownerEmail')} size="lg" type="email" placeholder="owner@school.com" autoComplete="email" />
          )}
        </Field>
        <div
          className="hstack t-sm"
          style={{ marginTop: 12, background: 'var(--pg)', border: '1px solid var(--bd2)', borderRadius: 9, padding: '9px 12px' }}
        >
          <span className="muted">Subdomain</span>
          <span className="mono ellipsis" style={{ fontWeight: 700 }}>
            {slug}
          </span>
          <span className="fg-good" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
            auto-SSL
          </span>
        </div>
        <div className="field-label" id="prov-plan">
          Plan
        </div>
        <Seg label="Plan" options={PLANS} value={plan} onChange={(v) => form.setValue('plan', v, { shouldDirty: true })} />
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Starts on a free trial. The owner sets their password from the invite email.
        </p>
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} disabled={provision.isPending}>
            {provision.isPending && <Spinner />} Create tenant
          </button>
        </div>
      </form>
    </Modal>
  );
}
