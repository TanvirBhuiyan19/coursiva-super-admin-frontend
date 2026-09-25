import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Badge, Bar, ConfirmButton, FormError, Toggle } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { LIMIT_KEYS, type LimitKey } from '@/lib/domain';
import { money, num, scoreTone, toneFg } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUi, toast } from '@/store/ui';
import {
  useCompExtension,
  useImpersonate,
  useResetTenantModules,
  useSetTenantFlag,
  useSetTenantModule,
  useTenantAction,
  useTransferOwnership,
  useUpdateTenant,
  useUpdateTenantLimits,
} from '../api';
import { t as msg, useT } from '../i18n';
import type { TenantDetail } from '../types';

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="hstack" style={{ marginTop: 20, marginBottom: 8, alignItems: 'baseline' }}>
        <h3 style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function HealthCard({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const { score, churnRisk, drivers } = tn.healthScore;
  const tone = scoreTone(score);
  return (
    <div className="card" style={{ padding: 14, marginTop: 16, borderRadius: 11 }}>
      <div className="hstack">
        <h3 style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t('health.title')}</h3>
        <Badge pill tone={tone} style={{ fontSize: 11 }}>
          {t(`health.churnRisk.${churnRisk}`)}
        </Badge>
      </div>
      <div className="hstack" style={{ gap: 12, marginTop: 10 }}>
        <span className="display" style={{ fontSize: 26, fontWeight: 800, color: toneFg(tone) }}>
          {score}
        </span>
        <Bar size="md" value={score} tone={tone} label={t('health.scoreLabel', { score })} />
      </div>
      <dl className="stack" style={{ gap: 7, marginTop: 12, marginBottom: 0 }}>
        {drivers.map((d) => (
          <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <dt className="muted">{d.label}</dt>
            <dd style={{ margin: 0, fontWeight: 700, color: d.trend === 'down' ? 'var(--rFg)' : 'var(--gFg)' }}>{d.value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="btn btn--sm btn--block"
        style={{ marginTop: 12 }}
        onClick={() => toast(churnRisk === 'Low' ? t('health.advocacyPlaybook') : t('health.savePlaybook'))}
      >
        {t('health.runPlaybook')}
      </button>
    </div>
  );
}

export function DomainSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const action = useTenantAction(tn.id);
  return (
    <Section title={t('domain.title')}>
      <div className="hstack t-sm" style={{ gap: 10, border: '1px solid var(--bd2)', borderRadius: 10, padding: '11px 13px' }}>
        <span className="mono ellipsis" style={{ flex: 1 }}>
          {tn.domain}
        </span>
        <span className="fg-good" style={{ fontWeight: 700, fontSize: 11.5 }}>
          {t('domain.verified')}
        </span>
        {can('tenants.manage') && (
          <button
            type="button"
            className="link"
            style={{ fontSize: 12 }}
            disabled={action.isPending}
            onClick={() => action.mutate('reissue-ssl', { onSuccess: () => toast(t('domain.reissued', { domain: tn.domain })) })}
          >
            {t('domain.reissue')}
          </button>
        )}
      </div>
    </Section>
  );
}

export function UsageSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const limitOf = (k: LimitKey) => tn.limits.find((l) => l.key === k)?.value ?? 0;
  const tc = useCommonT();
  const gb = (n: number) => t('drawer.gb', { value: n });
  const rows: [string, number, number, (n: number) => string][] = [
    [t('usage.students'), tn.students, limitOf('students'), num],
    [t('usage.storage'), tn.storageUsedGb, limitOf('storageGb'), gb],
    [t('usage.teamSeats'), tn.seatsUsed, limitOf('staffSeats'), num],
  ];
  return (
    <Section title={t('usage.title')}>
      <div className="stack" style={{ gap: 10 }}>
        {rows.map(([label, used, cap, fmt]) => {
          const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 4;
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span className="muted">{t('usage.usedOf', { used: fmt(used), cap: cap ? fmt(cap) : tc('states.unlimited') })}</span>
              </div>
              <Bar value={pct} color={pct >= 90 ? 'var(--rFg)' : undefined} label={t('usage.barLabel', { label, pct })} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const limitSchema = z.object(
  Object.fromEntries(
    LIMIT_KEYS.map((k) => [
      k,
      z.coerce
        .number({ error: () => msg('limits.errors.number') })
        .int({ error: () => msg('limits.errors.integer') })
        .min(0, { error: () => msg('limits.errors.min') }),
    ]),
  ) as Record<LimitKey, z.ZodCoercedNumber>,
);

export function LimitsSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const save = useUpdateTenantLimits(tn.id);
  const initial = Object.fromEntries(tn.limits.map((l) => [l.key, String(l.value)])) as Record<LimitKey, string>;
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<LimitKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = LIMIT_KEYS.some((k) => draft[k] !== initial[k]);
  const disabled = !can('tenants.manage');

  const apply = () => {
    const parsed = limitSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) as Partial<Record<LimitKey, string>>);
      return;
    }
    setErrors({});
    setFormError(null);
    const changed = Object.fromEntries(LIMIT_KEYS.filter((k) => draft[k] !== initial[k]).map((k) => [k, parsed.data[k]]));
    save.mutate(changed, {
      onSuccess: () => toast(t('limits.updated', { name: tn.name })),
      onError: (err) => {
        if (err instanceof ApiError && err.isValidation) {
          setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k.replace('limits.', ''), v[0]])));
        } else setFormError(errorMessage(err));
      },
    });
  };

  return (
    <Section title={t('limits.title')} right={<span className="t-xs faint">{t('limits.unlimitedHint')}</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {tn.limits.map((l) => (
          <label key={l.key}>
            <span className="faint" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              {tc(`enums.limit.${l.key}`)}
              {l.overridden && (
                <span className="fg-warn" title={t('limits.planDefault', { value: l.planDefault })}>
                  {' '}
                  •
                </span>
              )}
            </span>
            <input
              className="input"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft[l.key]}
              disabled={disabled}
              aria-invalid={!!errors[l.key]}
              style={{ fontSize: 12.5, padding: '8px 10px' }}
              onChange={(e) => setDraft((d) => ({ ...d, [l.key]: e.target.value }))}
            />
            {errors[l.key] && (
              <span className="field-error" style={{ display: 'block' }}>
                {errors[l.key]}
              </span>
            )}
          </label>
        ))}
      </div>
      <FormError>{formError}</FormError>
      {!disabled && (
        <div className="hstack" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--sm" style={{ flex: 1 }} disabled={!dirty || save.isPending} onClick={apply}>
            {save.isPending ? tc('actions.saving') : t('limits.apply')}
          </button>
          {tn.limits.some((l) => l.overridden) && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])), {
                  onSuccess: (d) => {
                    setDraft(Object.fromEntries(d.limits.map((l) => [l.key, String(l.value)])) as Record<LimitKey, string>);
                    toast(t('limits.reset', { plan: tc(`enums.plan.${tn.plan}`) }));
                  },
                })
              }
            >
              {t('limits.resetToPlan')}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

export function ExtensionsSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const comp = useCompExtension(tn.id);
  return (
    <div className="card" style={{ padding: 14, marginTop: 16, borderRadius: 11 }}>
      <h3 style={{ fontWeight: 700, fontSize: 13 }}>{t('extensions.title')}</h3>
      {tn.extensions.map((x) => (
        <div key={x.key} className="row t-sm" style={{ gap: 10, padding: '9px 0' }}>
          <div className="min0" style={{ flex: 1 }}>
            <div className="ellipsis" style={{ fontWeight: 600 }}>
              {x.name}
            </div>
            <div className="faint" style={{ fontSize: 10.5 }}>
              {t('extensions.listPrice', { price: money(x.price) })}
            </div>
          </div>
          <Badge xs tone={x.state === 'comped' ? 'warn' : x.state === 'paying' ? 'good' : 'flat'}>
            {x.state === 'comped'
              ? t('extensions.comped')
              : x.state === 'paying'
                ? t('extensions.paying', { price: money(x.price) })
                : t('extensions.notAdded')}
          </Badge>
          {can('billing.manage') && x.state !== 'paying' && (
            <button
              type="button"
              className={x.state === 'comped' ? 'link link--muted' : 'link'}
              style={{ fontSize: 11 }}
              disabled={comp.isPending}
              onClick={() =>
                comp.mutate(
                  { key: x.key, comped: x.state !== 'comped' },
                  {
                    onSuccess: () =>
                      toast(
                        x.state === 'comped'
                          ? t('extensions.compRevoked', { name: x.name })
                          : t('extensions.compGranted', { name: x.name, tenant: tn.name }),
                      ),
                  },
                )
              }
            >
              {x.state === 'comped' ? t('extensions.revoke') : t('extensions.comp')}
            </button>
          )}
        </div>
      ))}
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.5, margin: '9px 0 0' }}>
        {t('extensions.note')}
      </p>
    </div>
  );
}

export function ModulesSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const setModule = useSetTenantModule(tn.id);
  const reset = useResetTenantModules(tn.id);
  const [showAll, setShowAll] = useState(false);
  const diffs = tn.modules.filter((m) => m.overridden);
  const rows = showAll ? tn.modules : diffs;
  const disabled = !can('tenants.manage');
  const planName = tc(`enums.plan.${tn.plan}`);
  return (
    <Section
      title={t('modules.title')}
      right={
        <button type="button" className="link" style={{ fontSize: 11.5 }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? t('modules.showOverrides') : t('modules.showAll')}
        </button>
      }
    >
      <p className="t-xs muted" style={{ lineHeight: 1.5, margin: 0 }}>
        {t('modules.intro')}
      </p>
      <div className="t-xs faint" style={{ fontWeight: 700, marginTop: 6 }}>
        {diffs.length ? t('modules.overridden', { count: diffs.length }) : t('modules.exactlyPlan', { plan: planName })}
      </div>
      <div className="stack" style={{ marginTop: 6 }}>
        {rows.map((m) => (
          <div key={m.id} className="row t-sm" style={{ gap: 10, padding: '9px 0' }}>
            <span className="ellipsis" style={{ flex: 1 }}>
              {m.label}
              <span className="faint"> · {m.group}</span>
            </span>
            {m.overridden && (
              <Badge tag tone="warn">
                {m.enabled ? t('modules.granted') : t('modules.revoked')}
              </Badge>
            )}
            <Toggle
              on={m.enabled}
              label={t('modules.access', { module: m.label })}
              disabled={disabled}
              onChange={(next) =>
                setModule.mutate(
                  { moduleId: m.id, enabled: next === m.planDefault ? null : next },
                  {
                    onSuccess: () =>
                      toast(
                        t(
                          next
                            ? next === m.planDefault
                              ? 'modules.grantedDefault'
                              : 'modules.grantedOverride'
                            : next === m.planDefault
                              ? 'modules.revokedDefault'
                              : 'modules.revokedOverride',
                          { module: m.label, tenant: tn.name, plan: planName },
                        ),
                      ),
                  },
                )
              }
            />
          </div>
        ))}
      </div>
      {diffs.length > 0 && !disabled && (
        <button
          type="button"
          className="btn btn--sm btn--block"
          style={{ marginTop: 8 }}
          disabled={reset.isPending}
          onClick={() => reset.mutate(undefined, { onSuccess: () => toast(t('modules.reset', { name: tn.name, plan: planName })) })}
        >
          {t('modules.resetDefaults')}
        </button>
      )}
    </Section>
  );
}

export function FlagsSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const setFlag = useSetTenantFlag(tn.id);
  return (
    <Section title={t('flags.title')}>
      <div className="stack" style={{ gap: 10 }}>
        {tn.flags.map((f) => (
          <div key={f.key} className="t-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span>
              {f.name}
              {f.overridden && <span className="faint"> · {t('flags.overridden')}</span>}
            </span>
            <Toggle
              on={f.enabled}
              label={f.name}
              disabled={!can('flags.manage')}
              onChange={(enabled) =>
                setFlag.mutate(
                  { key: f.key, enabled },
                  { onSuccess: () => toast(t(enabled ? 'flags.enabled' : 'flags.disabled', { flag: f.name, tenant: tn.name })) },
                )
              }
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function AccessSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const action = useTenantAction(tn.id);
  const transfer = useTransferOwnership(tn.id);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!can('tenants.manage')) return null;
  const submit = () => {
    setError(null);
    transfer.mutate(email.trim(), {
      onSuccess: () => {
        toast(t('access.transferInitiated', { email: email.trim() }));
        setEmail('');
      },
      onError: (err) => setError(err instanceof ApiError ? (err.field('email') ?? err.message) : errorMessage(err)),
    });
  };
  return (
    <Section title={t('access.title')}>
      <div className="hstack">
        <button
          type="button"
          className="btn"
          style={{ flex: 1, padding: '9px 6px', fontSize: 12 }}
          disabled={action.isPending}
          onClick={() => action.mutate('reset-password', { onSuccess: () => toast(t('access.passwordResetSent', { name: tn.ownerName })) })}
        >
          {t('access.forcePasswordReset')}
        </button>
        <ConfirmButton
          className="btn"
          style={{ flex: 1, padding: '9px 6px', fontSize: 12 }}
          confirmLabel={t('access.confirmRevoke')}
          pending={action.isPending}
          onConfirm={() => action.mutate('revoke-sessions', { onSuccess: () => toast(t('access.sessionsRevoked', { name: tn.name })) })}
        >
          {t('access.revokeSessions')}
        </ConfirmButton>
      </div>
      <form
        className="hstack"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="input min0"
          style={{ flex: 1, fontSize: 12.5 }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('access.newOwnerPlaceholder')}
          aria-label={t('access.newOwnerLabel')}
          aria-invalid={!!error}
          required
        />
        <button type="submit" className="btn btn--primary" disabled={transfer.isPending || !email.trim()}>
          {t('access.transfer')}
        </button>
      </form>
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </Section>
  );
}

export function NotesSection({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const update = useUpdateTenant(tn.id);
  const [draft, setDraft] = useState('');
  if (!can('tenants.manage') && !tn.notes) return null;
  const save = () => {
    const d = draft.trim();
    if (!d) return;
    update.mutate(
      { notes: d },
      {
        onSuccess: () => {
          setDraft('');
          toast(t('notes.saved'));
        },
      },
    );
  };
  return (
    <Section title={t('notes.title')}>
      {tn.notes && (
        <div className="callout callout--warn" style={{ marginBottom: 10 }}>
          {tn.notes}
        </div>
      )}
      {can('tenants.manage') && (
        <form
          className="hstack"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            className="input min0"
            style={{ flex: 1, fontSize: 12.5 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder={tn.notes ? t('notes.replacePlaceholder') : t('notes.newPlaceholder')}
            aria-label={t('notes.label')}
          />
          <button type="submit" className="btn btn--primary" disabled={update.isPending || !draft.trim()}>
            {tc('actions.save')}
          </button>
        </form>
      )}
    </Section>
  );
}

export function DangerZone({ t: tn }: { t: TenantDetail }) {
  const t = useT();
  const can = useCan();
  const action = useTenantAction(tn.id);
  const impersonate = useImpersonate(tn.id);
  const setUi = useUi((s) => s.set);
  const suspended = tn.status === 'Suspended';
  return (
    <>
      {(can('tenants.manage') || can('tenants.purge')) && (
        <Section title={t('danger.data')}>
          <div className="hstack">
            {can('tenants.manage') && (
              <button
                type="button"
                className="btn"
                style={{ flex: 1, padding: 9 }}
                disabled={action.isPending}
                onClick={() => action.mutate('export', { onSuccess: () => toast(t('danger.exportQueued', { name: tn.ownerName })) })}
              >
                {t('danger.exportAll')}
              </button>
            )}
            {can('tenants.purge') && (
              <ConfirmButton
                style={{ flex: 1, padding: 9 }}
                confirmLabel={t('danger.confirmPurge')}
                pending={action.isPending}
                onConfirm={() => action.mutate('purge', { onSuccess: () => toast(t('danger.purgeScheduled', { name: tn.name })) })}
              >
                {t('danger.purge')}
              </ConfirmButton>
            )}
          </div>
        </Section>
      )}
      <div className="hstack" style={{ gap: 10, marginTop: 22 }}>
        {can('tenants.impersonate') && (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            style={{ flex: 1 }}
            disabled={impersonate.isPending}
            onClick={() => impersonate.mutate(undefined, { onSuccess: () => setUi({ impersonating: tn.id }) })}
          >
            {t('danger.signInAsOwner')}
          </button>
        )}
        {can('tenants.suspend') &&
          (suspended ? (
            <button
              type="button"
              className="btn btn--lg"
              style={{ flex: 1 }}
              disabled={action.isPending}
              onClick={() => action.mutate('reactivate', { onSuccess: () => toast(t('danger.reactivated', { name: tn.name })) })}
            >
              {t('danger.reactivate')}
            </button>
          ) : (
            <ConfirmButton
              className="btn btn--danger btn--lg"
              style={{ flex: 1 }}
              confirmLabel={t('danger.confirmSuspend')}
              pending={action.isPending}
              onConfirm={() =>
                action.mutate('suspend', {
                  onSuccess: () => toast(t('danger.suspended', { name: tn.name })),
                })
              }
            >
              {t('danger.suspend')}
            </ConfirmButton>
          ))}
      </div>
    </>
  );
}
