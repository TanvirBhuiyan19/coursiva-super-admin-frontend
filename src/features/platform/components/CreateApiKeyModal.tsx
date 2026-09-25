import { useState } from 'react';
import { z } from 'zod';
import { Field, FormError, Input, Modal, Seg, Spinner } from '@/components/ui';
import { errorMessage } from '@/lib/api/errors';
import { useT as useCommonT } from '@/lib/i18n/common';
import { applyServerErrors, useZodForm } from '@/lib/useForm';
import { toast } from '@/store/ui';
import { useCreateApiKey } from '../api';
import { t, useT } from '../i18n';
import { API_KEY_SCOPES, type CreatedApiKey } from '../types';

/** Decorative warning glyph (not text). */
const WARN_ICON = '⚠';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: () => t('createKey.nameMin') })
    .max(60, { error: () => t('createKey.nameMax') }),
  scope: z.enum(API_KEY_SCOPES),
});

/**
 * Two steps in one dialog: the create form, then the one-time secret. The secret lives only in this
 * component's state — it is never written to the query cache and is gone once the dialog closes.
 */
export function CreateApiKeyModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tc = useCommonT();
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
      toast(t('createKey.copiedToast', { name: created.name }));
    } catch {
      toast(t('createKey.copyFailed'), 'error');
    }
  };

  if (created)
    return (
      <Modal onClose={onClose} label={t('createKey.secretTitle')} width={500}>
        <h2 className="modal-title">{t('createKey.secretTitle')}</h2>
        <p className="t-sm muted" style={{ marginTop: 3 }}>
          {t('createKey.secretIntroBefore')} <span className="mono">{created.prefix}</span> {t('createKey.secretIntroAfter')}
        </p>
        <Field label={t('createKey.secretFieldLabel', { name: created.name, scope: t(`enums.apiKeyScope.${created.scope}`) })}>
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
          <span aria-hidden="true">{WARN_ICON}</span>
          <span>{t('createKey.secretWarning', { scope: t(`enums.apiKeyScopePhrase.${created.scope}`) })}</span>
        </div>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => void copy()}>
            {copied ? tc('actions.copied') : t('createKey.copyKey')}
          </button>
          <button type="button" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} onClick={onClose}>
            {copied ? t('createKey.done') : t('createKey.saved')}
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal onClose={onClose} label={t('createKey.title')}>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="modal-title">{t('createKey.title')}</h2>
        <p className="t-sm muted" style={{ marginTop: 3, marginBottom: 0 }}>
          {t('createKey.intro')}
        </p>
        <Field label={t('createKey.nameLabel')} error={form.formState.errors.name?.message}>
          {(p) => <Input {...p} {...form.register('name')} size="lg" placeholder={t('createKey.namePlaceholder')} autoComplete="off" />}
        </Field>
        <div className="field-label">{t('createKey.scope')}</div>
        <Seg
          label={t('createKey.scope')}
          options={API_KEY_SCOPES.map((sc) => [sc, t(`enums.apiKeyScope.${sc}`)] as const)}
          value={scope}
          onChange={(v) => form.setValue('scope', v, { shouldDirty: true })}
        />
        <FormError>{formError}</FormError>
        <div className="hstack" style={{ gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={onClose}>
            {tc('actions.cancel')}
          </button>
          <button type="submit" className="btn btn--primary btn--lg" style={{ flex: 1.4 }} disabled={create.isPending}>
            {create.isPending && <Spinner />} {t('createKey.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
