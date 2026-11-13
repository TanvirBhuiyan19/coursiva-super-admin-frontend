import { useState } from 'react';
import { Badge, ConfirmButton, Drawer, Field, FormError, Input, QueryState, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { toast } from '@/store/ui';
import { usePartner, usePartnerAction, usePartnerSettings, useUpdatePartner } from '../api';
import { t as tStatic, useT } from '../i18n';
import type { Partner, PartnerAction } from '../types';
import { cents, statusTone } from '../format';

const ACTIONS_FOR: Record<Partner['status'], PartnerAction[]> = {
  Pending: ['approve', 'decline', 'ban'],
  Active: ['pause', 'ban'],
  Paused: ['activate', 'ban'],
  Declined: ['approve', 'ban'],
  Banned: ['activate'],
};

/** One partner: status actions, the link and code, figures, and the per-partner overrides. */
export function PartnerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const q = usePartner(id);
  return (
    <Drawer onClose={onClose} width={460} label={t('drawer.title')}>
      <div className="drawer-body" style={{ padding: 20 }}>
        <QueryState query={q} skeleton={<SkeletonRows rows={6} />}>
          {(p) => <PartnerDetail key={JSON.stringify(p)} partner={p} />}
        </QueryState>
      </div>
    </Drawer>
  );
}

function PartnerDetail({ partner: p }: { partner: Partner }) {
  const t = useT();
  const can = useCan();
  const act = usePartnerAction();
  const save = useUpdatePartner();
  const terms = usePartnerSettings();
  const initial = {
    commissionPct: p.commissionPctOverride === null ? '' : String(p.commissionPctOverride),
    cookieDays: p.cookieDaysOverride === null ? '' : String(p.cookieDaysOverride),
    couponCode: p.couponCode ?? '',
    accountEmail: '',
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const run = (action: PartnerAction) =>
    act.mutate({ id: p.id, action }, { onSuccess: () => toast(tStatic(`toasts.${action}`, { name: p.name })) });
  const submit = () => {
    setErrors({});
    setFormError(null);
    save.mutate(
      {
        id: p.id,
        commissionPct: form.commissionPct === '' ? null : Number(form.commissionPct),
        cookieDays: form.cookieDays === '' ? null : Number(form.cookieDays),
        couponCode: form.couponCode.trim() === '' ? null : form.couponCode.trim(),
        ...(form.accountEmail.trim() ? { accountEmail: form.accountEmail.trim() } : {}),
      },
      {
        onSuccess: () => toast(tStatic('toasts.saved', { name: p.name })),
        onError: (err) => {
          if (err instanceof ApiError && err.isValidation)
            setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
          else setFormError(errorMessage(err));
        },
      },
    );
  };

  return (
    <div className="vstack" style={{ gap: 16 }}>
      <div>
        <h2 className="h3">{p.name}</h2>
        <div className="muted t-sm">{p.email}</div>
        <div className="hstack wrap" style={{ gap: 6, marginTop: 6 }}>
          <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
          {!p.emailVerified && <Badge tone="warn">{t('drawer.unconfirmed')}</Badge>}
        </div>
      </div>
      {can('partners.manage') && (
        <div className="hstack wrap" style={{ gap: 8 }}>
          {ACTIONS_FOR[p.status].map((a) =>
            a === 'ban' || a === 'decline' ? (
              <ConfirmButton
                key={a}
                className="btn btn--danger btn--sm"
                confirmLabel={t(a === 'ban' ? 'actions.confirmBan' : 'actions.confirmDecline')}
                onConfirm={() => run(a)}
                disabled={act.isPending}
              >
                {t(`actions.${a}`)}
              </ConfirmButton>
            ) : (
              <button
                key={a}
                type="button"
                className="btn btn--primary btn--sm"
                disabled={act.isPending || (a === 'approve' && !p.emailVerified)}
                onClick={() => run(a)}
              >
                {t(`actions.${a}`)}
              </button>
            ),
          )}
        </div>
      )}
      <section>
        <div className="field-label">{t('drawer.link')}</div>
        <code className="mono t-sm" style={{ overflowWrap: 'anywhere' }}>
          {p.link}
        </code>
        {p.stats && (
          <>
            <p className="t-sm muted" style={{ marginTop: 6 }}>
              {t('drawer.stats', { clicks: p.stats.clicks30d, schools: p.stats.signups, paying: p.stats.activeSchools })}
            </p>
            <p className="t-sm muted">
              {t('drawer.ledger', { held: cents(p.stats.held), owed: cents(p.stats.owed), paid: cents(p.stats.paid) })}
            </p>
          </>
        )}
      </section>
      {(p.website || p.audience || p.pitch) && (
        <section>
          <h3 className="field-label">{t('drawer.applicationTitle')}</h3>
          <dl className="t-sm">
            {p.website && (
              <>
                <dt className="muted">{t('drawer.website')}</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>{p.website}</dd>
              </>
            )}
            {p.audience && (
              <>
                <dt className="muted">{t('drawer.audience')}</dt>
                <dd>{p.audience}</dd>
              </>
            )}
            {p.pitch && (
              <>
                <dt className="muted">{t('drawer.pitch')}</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{p.pitch}</dd>
              </>
            )}
          </dl>
        </section>
      )}
      {can('partners.manage') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
          aria-label={t('drawer.overrides')}
          className="vstack"
          style={{ gap: 12 }}
        >
          <h3 className="field-label">{t('drawer.overrides')}</h3>
          <Field
            label={t('drawer.rate')}
            error={errors.commissionPct}
            hint={t('drawer.rateHint', { pct: terms.data?.commissionPct ?? 30 })}
          >
            {(f) => (
              <Input
                {...f}
                inputMode="decimal"
                value={form.commissionPct}
                onChange={(e) => setForm({ ...form, commissionPct: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('drawer.cookie')} error={errors.cookieDays} hint={t('drawer.cookieHint', { days: terms.data?.cookieDays ?? 90 })}>
            {(f) => (
              <Input
                {...f}
                inputMode="numeric"
                value={form.cookieDays}
                onChange={(e) => setForm({ ...form, cookieDays: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('drawer.code')} error={errors.couponCode} hint={t('drawer.codeHint')}>
            {(f) => (
              <Input {...f} autoComplete="off" value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} />
            )}
          </Field>
          <Field label={t('drawer.account')} error={errors.accountEmail} hint={t('drawer.accountHint')}>
            {(f) => (
              <Input
                {...f}
                type="email"
                autoComplete="off"
                value={form.accountEmail}
                onChange={(e) => setForm({ ...form, accountEmail: e.target.value })}
              />
            )}
          </Field>
          {formError && <FormError>{formError}</FormError>}
          <div>
            <button type="submit" className="btn btn--primary" disabled={!dirty || save.isPending}>
              {t('drawer.save')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
