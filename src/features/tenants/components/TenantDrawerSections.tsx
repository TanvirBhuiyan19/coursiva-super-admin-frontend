import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Badge, Bar, ConfirmButton, FormError, Toggle } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { LIMIT_KEYS, LIMIT_LABELS, type LimitKey } from '@/lib/domain';
import { num, scoreTone, toneFg } from '@/lib/format';
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

export function HealthCard({ t }: { t: TenantDetail }) {
  const { score, churnRisk, drivers } = t.healthScore;
  const tone = scoreTone(score);
  return (
    <div className="card" style={{ padding: 14, marginTop: 16, borderRadius: 11 }}>
      <div className="hstack">
        <h3 style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Health score</h3>
        <Badge pill tone={tone} style={{ fontSize: 11 }}>
          {churnRisk} churn risk
        </Badge>
      </div>
      <div className="hstack" style={{ gap: 12, marginTop: 10 }}>
        <span className="display" style={{ fontSize: 26, fontWeight: 800, color: toneFg(tone) }}>
          {score}
        </span>
        <Bar size="md" value={score} tone={tone} label={`Health score ${score} of 100`} />
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
        onClick={() =>
          toast(
            churnRisk === 'Low'
              ? 'Added to the advocacy playbook — review & case-study asks'
              : 'Save playbook started — success manager assigned, check-in email scheduled',
          )
        }
      >
        Run the matching playbook
      </button>
    </div>
  );
}

export function DomainSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const action = useTenantAction(t.id);
  return (
    <Section title="Domain">
      <div className="hstack t-sm" style={{ gap: 10, border: '1px solid var(--bd2)', borderRadius: 10, padding: '11px 13px' }}>
        <span className="mono ellipsis" style={{ flex: 1 }}>
          {t.domain}
        </span>
        <span className="fg-good" style={{ fontWeight: 700, fontSize: 11.5 }}>
          ✓ DNS · SSL
        </span>
        {can('tenants.manage') && (
          <button
            type="button"
            className="link"
            style={{ fontSize: 12 }}
            disabled={action.isPending}
            onClick={() => action.mutate('reissue-ssl', { onSuccess: () => toast(`SSL certificate reissued for ${t.domain}`) })}
          >
            Reissue
          </button>
        )}
      </div>
    </Section>
  );
}

export function UsageSection({ t }: { t: TenantDetail }) {
  const limitOf = (k: LimitKey) => t.limits.find((l) => l.key === k)?.value ?? 0;
  const rows: [string, number, number, string][] = [
    ['Students', t.students, limitOf('students'), ''],
    ['Storage', t.storageUsedGb, limitOf('storageGb'), ' GB'],
    ['Team seats', t.seatsUsed, limitOf('staffSeats'), ''],
  ];
  return (
    <Section title="Usage">
      <div className="stack" style={{ gap: 10 }}>
        {rows.map(([label, used, cap, unit]) => {
          const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 4;
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span className="muted">
                  {num(used)}
                  {unit} / {cap ? num(cap) + unit : 'Unlimited'}
                </span>
              </div>
              <Bar value={pct} color={pct >= 90 ? 'var(--rFg)' : undefined} label={`${label} ${pct}% used`} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const limitSchema = z.object(
  Object.fromEntries(
    LIMIT_KEYS.map((k) => [k, z.coerce.number({ error: 'Enter a number' }).int('Whole numbers only').min(0, '0 or more (0 = unlimited)')]),
  ) as Record<LimitKey, z.ZodCoercedNumber>,
);

export function LimitsSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const save = useUpdateTenantLimits(t.id);
  const initial = Object.fromEntries(t.limits.map((l) => [l.key, String(l.value)])) as Record<LimitKey, string>;
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
      onSuccess: () => toast(`Limits updated for ${t.name}`),
      onError: (err) => {
        if (err instanceof ApiError && err.isValidation) {
          setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k.replace('limits.', ''), v[0]])));
        } else setFormError(errorMessage(err));
      },
    });
  };

  return (
    <Section title="Limits & quotas" right={<span className="t-xs faint">0 = unlimited</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {t.limits.map((l) => (
          <label key={l.key}>
            <span className="faint" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              {LIMIT_LABELS[l.key]}
              {l.overridden && (
                <span className="fg-warn" title={`Plan default: ${l.planDefault}`}>
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
            {save.isPending ? 'Saving…' : 'Apply limits'}
          </button>
          {t.limits.some((l) => l.overridden) && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(Object.fromEntries(LIMIT_KEYS.map((k) => [k, null])), {
                  onSuccess: (d) => {
                    setDraft(Object.fromEntries(d.limits.map((l) => [l.key, String(l.value)])) as Record<LimitKey, string>);
                    toast(`Limits reset to the ${t.plan} plan`);
                  },
                })
              }
            >
              Reset to plan
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

export function ExtensionsSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const comp = useCompExtension(t.id);
  return (
    <div className="card" style={{ padding: 14, marginTop: 16, borderRadius: 11 }}>
      <h3 style={{ fontWeight: 700, fontSize: 13 }}>Extensions</h3>
      {t.extensions.map((x) => (
        <div key={x.key} className="row t-sm" style={{ gap: 10, padding: '9px 0' }}>
          <div className="min0" style={{ flex: 1 }}>
            <div className="ellipsis" style={{ fontWeight: 600 }}>
              {x.name}
            </div>
            <div className="faint" style={{ fontSize: 10.5 }}>
              ${x.price}/mo list
            </div>
          </div>
          <Badge xs tone={x.state === 'comped' ? 'warn' : x.state === 'paying' ? 'good' : 'flat'}>
            {x.state === 'comped' ? 'Comped by staff' : x.state === 'paying' ? `Paying $${x.price}/mo` : 'Not added'}
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
                          ? `${x.name} comp revoked — billing resumes next cycle`
                          : `${x.name} granted to ${t.name} — free until revoked, logged in the audit trail`,
                      ),
                  },
                )
              }
            >
              {x.state === 'comped' ? 'Revoke' : 'Comp'}
            </button>
          )}
        </div>
      ))}
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.5, margin: '9px 0 0' }}>
        Granting an extension shows as “Comped by staff” on their invoice and survives plan changes until you revoke it.
      </p>
    </div>
  );
}

export function ModulesSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const setModule = useSetTenantModule(t.id);
  const reset = useResetTenantModules(t.id);
  const [showAll, setShowAll] = useState(false);
  const diffs = t.modules.filter((m) => m.overridden);
  const rows = showAll ? t.modules : diffs;
  const disabled = !can('tenants.manage');
  return (
    <Section
      title="Module access"
      right={
        <button type="button" className="link" style={{ fontSize: 11.5 }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {showAll ? 'Show only overrides' : 'Show all modules'}
        </button>
      }
    >
      <p className="t-xs muted" style={{ lineHeight: 1.5, margin: 0 }}>
        Grants and revokes here win over the plan. Use them for pilots, contractual exceptions and trials.
      </p>
      <div className="t-xs faint" style={{ fontWeight: 700, marginTop: 6 }}>
        {diffs.length ? `${diffs.length} ${diffs.length === 1 ? 'module' : 'modules'} overridden` : `Exactly the ${t.plan} plan`}
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
                {m.enabled ? 'Granted' : 'Revoked'}
              </Badge>
            )}
            <Toggle
              on={m.enabled}
              label={`${m.label} access`}
              disabled={disabled}
              onChange={(next) =>
                setModule.mutate(
                  { moduleId: m.id, enabled: next === m.planDefault ? null : next },
                  {
                    onSuccess: () =>
                      toast(
                        `${m.label}${next ? ' granted to ' : ' revoked for '}${t.name}${next === m.planDefault ? ` — back to the ${t.plan} default` : ` — overrides the ${t.plan} plan`}`,
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
          onClick={() => reset.mutate(undefined, { onSuccess: () => toast(`${t.name} reset to the ${t.plan} plan`) })}
        >
          Reset to plan defaults
        </button>
      )}
    </Section>
  );
}

export function FlagsSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const setFlag = useSetTenantFlag(t.id);
  return (
    <Section title="Feature overrides">
      <div className="stack" style={{ gap: 10 }}>
        {t.flags.map((f) => (
          <div key={f.key} className="t-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span>
              {f.name}
              {f.overridden && <span className="faint"> · overridden</span>}
            </span>
            <Toggle
              on={f.enabled}
              label={f.name}
              disabled={!can('flags.manage')}
              onChange={(enabled) =>
                setFlag.mutate(
                  { key: f.key, enabled },
                  { onSuccess: () => toast(`${f.name}${enabled ? ' enabled' : ' disabled'} for ${t.name}`) },
                )
              }
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function AccessSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const action = useTenantAction(t.id);
  const transfer = useTransferOwnership(t.id);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!can('tenants.manage')) return null;
  const submit = () => {
    setError(null);
    transfer.mutate(email.trim(), {
      onSuccess: () => {
        toast(`Ownership transfer initiated — confirmation sent to ${email.trim()}`);
        setEmail('');
      },
      onError: (err) => setError(err instanceof ApiError ? (err.field('email') ?? err.message) : errorMessage(err)),
    });
  };
  return (
    <Section title="Security & access">
      <div className="hstack">
        <button
          type="button"
          className="btn"
          style={{ flex: 1, padding: '9px 6px', fontSize: 12 }}
          disabled={action.isPending}
          onClick={() => action.mutate('reset-password', { onSuccess: () => toast(`Password reset email sent to ${t.ownerName}`) })}
        >
          Force password reset
        </button>
        <ConfirmButton
          className="btn"
          style={{ flex: 1, padding: '9px 6px', fontSize: 12 }}
          confirmLabel="Confirm revoke"
          pending={action.isPending}
          onConfirm={() => action.mutate('revoke-sessions', { onSuccess: () => toast(`All active sessions revoked for ${t.name}`) })}
        >
          Revoke all sessions
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
          placeholder="New owner’s email…"
          aria-label="New owner email"
          aria-invalid={!!error}
          required
        />
        <button type="submit" className="btn btn--primary" disabled={transfer.isPending || !email.trim()}>
          Transfer
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

export function NotesSection({ t }: { t: TenantDetail }) {
  const can = useCan();
  const update = useUpdateTenant(t.id);
  const [draft, setDraft] = useState('');
  if (!can('tenants.manage') && !t.notes) return null;
  const save = () => {
    const d = draft.trim();
    if (!d) return;
    update.mutate(
      { notes: d },
      {
        onSuccess: () => {
          setDraft('');
          toast('Note saved');
        },
      },
    );
  };
  return (
    <Section title="Internal note">
      {t.notes && (
        <div className="callout callout--warn" style={{ marginBottom: 10 }}>
          {t.notes}
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
            placeholder={t.notes ? 'Replace the note…' : 'Visible to platform staff only…'}
            aria-label="Internal note"
          />
          <button type="submit" className="btn btn--primary" disabled={update.isPending || !draft.trim()}>
            Save
          </button>
        </form>
      )}
    </Section>
  );
}

export function DangerZone({ t }: { t: TenantDetail }) {
  const can = useCan();
  const action = useTenantAction(t.id);
  const impersonate = useImpersonate(t.id);
  const setUi = useUi((s) => s.set);
  const suspended = t.status === 'Suspended';
  return (
    <>
      {(can('tenants.manage') || can('tenants.purge')) && (
        <Section title="Data">
          <div className="hstack">
            {can('tenants.manage') && (
              <button
                type="button"
                className="btn"
                style={{ flex: 1, padding: 9 }}
                disabled={action.isPending}
                onClick={() =>
                  action.mutate('export', { onSuccess: () => toast(`Full data export queued — download link emailed to ${t.ownerName}`) })
                }
              >
                Export all data
              </button>
            )}
            {can('tenants.purge') && (
              <ConfirmButton
                style={{ flex: 1, padding: 9 }}
                confirmLabel="Confirm purge?"
                pending={action.isPending}
                onConfirm={() => action.mutate('purge', { onSuccess: () => toast(`Purge scheduled for ${t.name} — 30-day grace period`) })}
              >
                Purge data
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
            onClick={() => impersonate.mutate(undefined, { onSuccess: () => setUi({ impersonating: t.id }) })}
          >
            Sign in as owner
          </button>
        )}
        {can('tenants.suspend') &&
          (suspended ? (
            <button
              type="button"
              className="btn btn--lg"
              style={{ flex: 1 }}
              disabled={action.isPending}
              onClick={() => action.mutate('reactivate', { onSuccess: () => toast(`${t.name} reactivated`) })}
            >
              Reactivate
            </button>
          ) : (
            <ConfirmButton
              className="btn btn--danger btn--lg"
              style={{ flex: 1 }}
              confirmLabel="Confirm suspend"
              pending={action.isPending}
              onConfirm={() =>
                action.mutate('suspend', {
                  onSuccess: () => toast(`${t.name} suspended — storefront offline, students keep their certificates`),
                })
              }
            >
              Suspend
            </ConfirmButton>
          ))}
      </div>
    </>
  );
}
