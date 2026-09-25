import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Seg, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useCreateApiKey } from '../api';
import { API_KEY_SCOPES, type CreatedApiKey } from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Name the key (2+ characters) so you know where it’s used.').max(60, 'Keep the name under 60 characters.'),
  scope: z.enum(API_KEY_SCOPES),
});

/**
 * Two steps in one dialog: the create form, then the one-time secret. The secret lives only in this
 * component's state — it is never written to the query cache and is gone once the dialog closes.
 */
export function CreateApiKeyModal({ onClose }: { onClose: () => void }) {
  const create = useCreateApiKey();
  const form = useZodForm(schema, { defaultValues: { name: '', scope: 'Read only' } });
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const scope = form.watch('scope');

  const submit = form.handleSubmit((values) => {
    setFormError(null);
    create.mutate(values, {
      onSuccess: (key) => setCreated(key),
      onError: (err) => {
        if (!applyServerErrors(form, err)) setFormError(errorMessage(err));
      },
    });
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
      toast(`${created.name} copied — store it in your secrets manager`);
    } catch {
      toast('Couldn’t copy — select the key and copy it manually', 'error');
    }
  };

  if (created)
    return (
      <Modal onClose={onClose} label="Copy your new API key" width={500}>
        <h2 className="modal-title">Copy your new API key</h2>
        <p className="t-sm muted" style={{ marginTop: 3 }}>
          This is the only time the full key is shown. After you close this dialog only <span className="mono">{created.prefix}</span> is
          visible.
        </p>
        <Field label={`${created.name} · ${created.scope}`}>
          {(p) => (
            <Input
              {...p}
              readOnly
              value={created.secret}
              className="mono"
              style={{ fontSize: 12.5 }}
              onFocus={(e) => e.currentTarget.select()}
              data-autofocus
            />
          )}
        </Field>
        <div className="callout callout--warn" style={{ marginTop: 12 }}>
          <span aria-hidden="true">⚠</span>
          <span>
            Anyone with this key can call the platform API with {created.scope.toLowerCase()} permissions. Don’t paste it in tickets or
            chat.
          </span>
        </div>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy key'}
          </button>
          <button type="button" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} onClick={onClose}>
            {copied ? 'Done' : 'I’ve saved it'}
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal onClose={onClose} label="Create an API key">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="modal-title">Create an API key</h2>
        <p className="t-sm muted" style={{ marginTop: 3, marginBottom: 0 }}>
          Platform keys call the admin API on behalf of Coursiva staff. Use the narrowest scope that works.
        </p>
        <Field label="Key name" error={form.formState.errors.name?.message}>
          {(p) => <Input {...p} {...form.register('name')} size="lg" placeholder="e.g. Metabase sync" autoComplete="off" />}
        </Field>
        <div className="field-label">Scope</div>
        <Seg label="Scope" options={API_KEY_SCOPES} value={scope} onChange={(v) => form.setValue('scope', v, { shouldDirty: true })} />
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} disabled={create.isPending}>
            {create.isPending && <Spinner />} Create key
          </button>
        </div>
      </form>
    </Modal>
  );
}
