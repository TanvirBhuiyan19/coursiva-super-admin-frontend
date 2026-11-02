import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Chip, Field, FormError, Input, QueryState, Seg, SkeletonRows, Spinner, UnsavedChangesGuard } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { toast } from '@/store/ui';
import { useDomainSettings, useUpdateDomainSettings } from '../api';
import { usd } from '../format';
import { t as tStatic, useT } from '../i18n';
import { resalePrice } from '../pricing';
import type { DomainRounding, DomainSettings, DomainSettingsUpdate, RegistrarCapabilities, RegistrarKey } from '../types';

/** The registrar's default extensions (docs/api/domains.md) — offered back when one is switched off. */
const DEFAULT_TLDS = ['com', 'net', 'org', 'co', 'io', 'academy', 'school', 'courses', 'education', 'online', 'dev', 'app'];
const TLD_PATTERN = /^[a-z0-9-]{2,24}(\.[a-z0-9-]{2,24})?$/;
const MAX_TLDS = 50;
const CAPABILITIES = [
  'renew',
  'autoRenewToggle',
  'transferOut',
  'contactUpdate',
  'dns',
] as const satisfies readonly (keyof RegistrarCapabilities)[];

interface Draft {
  registrar: RegistrarKey;
  markupPercent: string;
  markupMin: string;
  rounding: DomainRounding;
  enabledTlds: string[];
  renewalLeadDays: string;
  /** '' = the registrar's own agreement. */
  registrationAgreementUrl: string;
  /** '' resets to ICANN's page. */
  registrantBenefitsUrl: string;
  registrantEducationUrl: string;
}
type ErrorKey = keyof Draft;
const URL_FIELDS = ['registrationAgreementUrl', 'registrantBenefitsUrl', 'registrantEducationUrl'] as const;
const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;

const draftOf = (s: DomainSettings): Draft => ({
  registrar: s.registrar,
  markupPercent: String(s.markupPercent),
  markupMin: s.markupMin.toFixed(2),
  rounding: s.rounding,
  enabledTlds: [...s.enabledTlds],
  renewalLeadDays: String(s.renewalLeadDays),
  registrationAgreementUrl: s.registrationAgreementUrl ?? '',
  registrantBenefitsUrl: s.registrantBenefitsUrl,
  registrantEducationUrl: s.registrantEducationUrl,
});

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** Only the fields that differ from the saved settings (the API takes any subset; the audit names them). */
function patchOf(d: Draft, s: DomainSettings): DomainSettingsUpdate {
  const p: DomainSettingsUpdate = {};
  if (d.registrar !== s.registrar) p.registrar = d.registrar;
  if (num(d.markupPercent) !== s.markupPercent) p.markupPercent = num(d.markupPercent);
  if (num(d.markupMin) !== s.markupMin) p.markupMin = num(d.markupMin);
  if (d.rounding !== s.rounding) p.rounding = d.rounding;
  if (d.enabledTlds.join() !== s.enabledTlds.join()) p.enabledTlds = d.enabledTlds;
  if (num(d.renewalLeadDays) !== s.renewalLeadDays) p.renewalLeadDays = num(d.renewalLeadDays);
  // An emptied link is sent as null: the API resets it to its default.
  for (const f of URL_FIELDS) if (d[f].trim() !== (s[f] ?? '')) p[f] = d[f].trim() || null;
  return p;
}

function validate(d: Draft): Partial<Record<ErrorKey, string>> {
  const e: Partial<Record<ErrorKey, string>> = {};
  const pct = num(d.markupPercent);
  const twoDecimals = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
  if (Number.isNaN(pct) || pct < 0 || pct > 200 || !twoDecimals(d.markupPercent)) e.markupPercent = tStatic('settings.markupPercentRange');
  const min = num(d.markupMin);
  if (Number.isNaN(min) || min < 0 || min > 100 || !twoDecimals(d.markupMin)) e.markupMin = tStatic('settings.markupMinRange');
  const lead = num(d.renewalLeadDays);
  if (!Number.isInteger(lead) || lead < 7 || lead > 60) e.renewalLeadDays = tStatic('settings.leadDaysRange');
  if (!d.enabledTlds.length) e.enabledTlds = tStatic('settings.tldsEmpty');
  for (const f of URL_FIELDS) {
    const v = d[f].trim();
    if (v && (v.length > 500 || !HTTPS.test(v)))
      e[f] = f === 'registrationAgreementUrl' ? tStatic('settings.urlAgreement') : tStatic('settings.urlIcann');
  }
  return e;
}

export default function SettingsView() {
  const query = useDomainSettings();
  return (
    <QueryState query={query} skeleton={<SkeletonRows rows={8} />}>
      {(settings) => <SettingsForm key={JSON.stringify(settings)} settings={settings} />}
    </QueryState>
  );
}

function SettingsForm({ settings }: { settings: DomainSettings }) {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateDomainSettings();
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [newTld, setNewTld] = useState('');
  const [tldError, setTldError] = useState<string | null>(null);
  const [sampleCost, setSampleCost] = useState(settings.example.cost.toFixed(2));

  const patch = patchOf(draft, settings);
  const dirty = Object.keys(patch).length > 0;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const current = settings.registrars.find((r) => r.key === settings.registrar);
  const chosen = settings.registrars.find((r) => r.key === draft.registrar);

  // Live preview of the draft (the saved settings' price comes from the API as `example`).
  const pct = num(draft.markupPercent);
  const min = num(draft.markupMin);
  const cost = num(sampleCost);
  const previewable = !Number.isNaN(pct) && !Number.isNaN(min) && !Number.isNaN(cost) && cost >= 0;
  const preview = previewable ? resalePrice(cost, pct, min, draft.rounding) : null;

  const candidates = [...new Set([...draft.enabledTlds, ...DEFAULT_TLDS])];
  const toggleTld = (tld: string) =>
    set('enabledTlds', draft.enabledTlds.includes(tld) ? draft.enabledTlds.filter((x) => x !== tld) : [...draft.enabledTlds, tld]);
  const addTld = () => {
    const tld = newTld.trim().toLowerCase().replace(/^\./, '');
    const problem = !TLD_PATTERN.test(tld)
      ? t('settings.tldInvalid')
      : draft.enabledTlds.includes(tld)
        ? t('settings.tldDuplicate', { tld })
        : draft.enabledTlds.length >= MAX_TLDS
          ? t('settings.tldsMax')
          : null;
    setTldError(problem);
    if (problem) return;
    setNewTld('');
    set('enabledTlds', [...draft.enabledTlds, tld]);
  };

  const save = () => {
    const local = validate(draft);
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    update.mutate(patch, {
      onSuccess: () => toast(tStatic('toasts.settingsSaved')),
      onError: (err) => {
        if (err instanceof ApiError && err.isValidation) {
          const next: Partial<Record<ErrorKey, string>> = {};
          for (const [field, msgs] of Object.entries(err.fieldErrors)) {
            const key = field.replace(/\.\d+$/, '') as ErrorKey;
            if (key in draft) next[key] ??= msgs[0];
          }
          if (Object.keys(next).length) {
            setErrors(next);
            return;
          }
        }
        setFormError(errorMessage(err));
      },
    });
  };

  return (
    <form
      aria-label={t('settings.formLabel')}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="stack"
      style={{ gap: 14 }}
    >
      <UnsavedChangesGuard when={dirty} />
      {!manage && (
        <div className="callout" role="note">
          {t('settings.readOnly')}
        </div>
      )}
      {current && !current.configured && (
        <div className="callout callout--warn" role="alert">
          {t('settings.registrarMissing', { name: current.name })}{' '}
          <Link className="link" to={`${pathOf('connections')}?section=cdn`}>
            {t('settings.connectionsLink')}
          </Link>
        </div>
      )}

      <Card title={t('settings.title')}>
        {settings.warnings.map((w) => (
          <p key={w} role="alert" className="t-sm" style={{ marginBottom: 12 }}>
            <Badge tone="warn" pill xs>
              {t('sandbox.badge')}
            </Badge>{' '}
            {w}
          </p>
        ))}
        <Field label={t('settings.registrar')} error={errors.registrar} hint={t('settings.registrarHint')}>
          {(p) => (
            <select
              {...p}
              className="select"
              value={draft.registrar}
              disabled={!manage}
              onChange={(e) => set('registrar', e.target.value as RegistrarKey)}
            >
              {settings.registrars.map((r) => (
                <option key={r.key} value={r.key} disabled={!r.configured && r.key !== settings.registrar}>
                  {r.configured ? r.name : t('settings.notConfigured', { name: r.name })}
                </option>
              ))}
            </select>
          )}
        </Field>
        {chosen && (
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow">{t('settings.capabilities', { name: chosen.name })}</div>
            <ul className="plain-list hstack wrap" style={{ gap: 6, marginTop: 6 }}>
              {CAPABILITIES.map((c) => {
                const label = t(`settings.capability.${c}`);
                return (
                  <li key={c}>
                    <Badge tone={chosen.capabilities[c] ? 'good' : 'flat'} xs pill>
                      {chosen.capabilities[c] ? t('settings.capabilityOn', { label }) : t('settings.capabilityOff', { label })}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <Card title={t('settings.pricing')} sub={t('settings.currency', { currency: settings.currency })}>
        <div className="grid-3" style={{ gap: 14 }}>
          <Field label={t('settings.markupPercent')} error={errors.markupPercent} hint={t('settings.markupPercentHint')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                min={0}
                max={200}
                value={draft.markupPercent}
                disabled={!manage}
                onChange={(e) => set('markupPercent', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('settings.markupMin')} error={errors.markupMin} hint={t('settings.markupMinHint')}>
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                max={100}
                value={draft.markupMin}
                disabled={!manage}
                onChange={(e) => set('markupMin', e.target.value)}
              />
            )}
          </Field>
          <div>
            <div className="field-label" aria-hidden="true">
              {t('settings.rounding')}
            </div>
            <Seg
              label={t('settings.rounding')}
              value={draft.rounding}
              disabled={!manage}
              onChange={(v) => set('rounding', v)}
              options={[
                ['x99', t('settings.roundingX99')],
                ['none', t('settings.roundingNone')],
              ]}
            />
            {errors.rounding && <div className="field-error">{errors.rounding}</div>}
          </div>
        </div>

        <div className="card card--inset" style={{ marginTop: 14 }} role="region" aria-label={t('settings.preview')}>
          <div className="hstack wrap" style={{ gap: 14, alignItems: 'flex-end' }}>
            <Field label={t('settings.sampleCost')} style={{ width: 170 }}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={sampleCost}
                  onChange={(e) => setSampleCost(e.target.value)}
                />
              )}
            </Field>
            <div className="min0" style={{ flex: 1, paddingBottom: 6 }}>
              <div className="eyebrow">{t('settings.preview')}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }} aria-live="polite">
                {preview != null
                  ? t('settings.previewLine', {
                      cost: usd(cost),
                      price: usd(preview),
                      margin: usd((Math.round(preview * 100) - Math.round(cost * 100)) / 100),
                    })
                  : '—'}
              </div>
              <div className="t-xs muted">
                {dirty
                  ? t('settings.previewUnsaved', { cost: usd(settings.example.cost), price: usd(settings.example.price) })
                  : t('settings.previewSaved')}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t('settings.tlds')} sub={t('settings.tldsHint')}>
        <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label={t('settings.tldsLabel')}>
          {candidates.map((tld) => (
            <Chip key={tld} size="sm" on={draft.enabledTlds.includes(tld)} disabled={!manage} onClick={() => toggleTld(tld)}>
              .{tld}
            </Chip>
          ))}
        </div>
        {errors.enabledTlds && (
          <div className="field-error" role="alert" style={{ marginTop: 6 }}>
            {errors.enabledTlds}
          </div>
        )}
        {manage && (
          <div className="hstack wrap" style={{ gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
            <Field label={t('settings.tldAdd')} error={tldError ?? undefined} style={{ width: 220 }}>
              {(p) => (
                <Input
                  {...p}
                  value={newTld}
                  placeholder={t('settings.tldAddPlaceholder')}
                  autoComplete="off"
                  onChange={(e) => setNewTld(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTld();
                    }
                  }}
                />
              )}
            </Field>
            <button type="button" className="btn btn--sm" style={{ marginTop: 22 }} onClick={addTld}>
              {t('settings.tldAddButton')}
            </button>
          </div>
        )}
      </Card>

      <Card title={t('settings.terms')} sub={t('settings.termsHint')}>
        <div className="stack" style={{ gap: 12 }}>
          {URL_FIELDS.map((f) => (
            <Field key={f} label={t(`settings.${f}`)} error={errors[f]}>
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  inputMode="url"
                  maxLength={500}
                  placeholder={t('settings.urlPlaceholder')}
                  value={draft[f]}
                  disabled={!manage}
                  onChange={(e) => set(f, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
        <div className="eyebrow" style={{ marginTop: 14 }}>
          {t('settings.termsLinked')}
        </div>
        <ul className="plain-list t-sm" style={{ marginTop: 4 }}>
          {settings.terms.map((term) => (
            <li key={term.key} style={{ padding: '3px 0' }}>
              <a className="link" href={term.url} target="_blank" rel="noopener noreferrer">
                {term.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('settings.renewals')}>
        <Field label={t('settings.leadDays')} error={errors.renewalLeadDays} hint={t('settings.leadDaysHint')} style={{ maxWidth: 320 }}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={7}
              max={60}
              value={draft.renewalLeadDays}
              disabled={!manage}
              onChange={(e) => set('renewalLeadDays', e.target.value)}
            />
          )}
        </Field>
      </Card>

      <FormError>{formError}</FormError>
      {manage && (
        // Sticks to the bottom of the screen while there are unsaved edits, so Save is always in reach on this long form.
        <div
          className="hstack"
          role={dirty ? 'region' : undefined}
          aria-label={dirty ? t('settings.unsaved') : undefined}
          style={{
            gap: 8,
            justifyContent: 'flex-end',
            alignItems: 'center',
            ...(dirty
              ? {
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 2,
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--bd2)',
                  borderRadius: 12,
                  boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.08)',
                }
              : {}),
          }}
        >
          {dirty && <span style={{ marginRight: 'auto', fontWeight: 600 }}>{t('settings.unsaved')}</span>}
          <button
            type="button"
            className="btn"
            disabled={!dirty || update.isPending}
            onClick={() => {
              setDraft(draftOf(settings));
              setErrors({});
              setFormError(null);
            }}
          >
            {t('settings.discard')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!dirty || update.isPending}>
            {update.isPending && <Spinner />} {t('settings.save')}
          </button>
        </div>
      )}
    </form>
  );
}
