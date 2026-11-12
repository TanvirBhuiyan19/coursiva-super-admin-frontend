import { useState } from 'react';
import {
  Badge,
  Card,
  ConfirmButton,
  Empty,
  Field,
  FormError,
  Input,
  Pagination,
  QueryState,
  SkeletonRows,
  TRow,
  UnsavedChangesGuard,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useSession } from '@/features/auth/api';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import {
  useBatchAction,
  useDraftPayoutBatch,
  usePartnerSettings,
  usePartnerTaxForms,
  usePayoutBatch,
  usePayoutBatches,
  usePayoutFunding,
  useRetryPayout,
  useReviewTaxForm,
  useUpdatePartnerSettings,
} from '../api';
import { t as tStatic, useT } from '../i18n';
import { PAYOUT_RAILS, type LineKind, type PartnerTerms, type PartnerTermsSettings, type PayoutBatch } from '../types';
import { cents } from '../format';

const ITEM_STATUSES = ['queued', 'processing', 'paid', 'failed', 'returned', 'unclaimed', 'reversed', 'canceled'] as const;

const batchTone = (s: PayoutBatch['status']) =>
  s === 'completed' ? 'good' : s === 'partially_failed' || s === 'canceled' ? 'bad' : s === 'draft' ? 'flat' : 'info';

export function PayoutsSection() {
  const t = useT();
  const can = useCan();
  const funding = usePayoutFunding();
  const [url, setUrl] = useUrlState({ bpage: '1' });
  const batches = usePayoutBatches({ page: Number(url.bpage) || 1 });
  const draft = useDraftPayoutBatch();
  const [open, setOpen] = useState<string | null>(null);
  const cols = '110px 1fr 100px 120px 1fr';
  return (
    <>
      <Card
        title={t('sections.payouts')}
        right={
          can('partners.payout') ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={draft.isPending}
              onClick={() =>
                draft.mutate(undefined, {
                  onSuccess: (b) => {
                    setOpen(b.id);
                    toast(tStatic('toasts.drafted', { amount: cents(b.total) }));
                  },
                })
              }
            >
              {t('payouts.draft')}
            </button>
          ) : null
        }
      >
        <QueryState query={funding} compact skeleton={<SkeletonRows rows={1} />}>
          {(f) => (
            <div className="t-sm muted" style={{ marginBottom: 12 }}>
              <p>{f.stripeBalance === null ? t('payouts.balanceUnknown') : t('payouts.balance', { amount: cents(f.stripeBalance) })}</p>
              <p>{t('payouts.minimum', { min: cents(f.minimum), dual: cents(f.dualApproval), day: f.payoutDay })}</p>
              {f.rails
                .filter((r) => !r.available && r.reason)
                .map((r) => (
                  <p key={r.rail} className="fg-warn">
                    {t('payouts.railUnavailable', { rail: t(`rails.${r.rail}`), reason: r.reason ?? '' })}
                  </p>
                ))}
            </div>
          )}
        </QueryState>
        <QueryState query={batches} skeleton={<SkeletonRows rows={3} />}>
          {(page) =>
            page.data.length === 0 ? (
              <Empty>{t('empty.payouts')}</Empty>
            ) : (
              <>
                <div className="table-scroll">
                  <div role="table" aria-label={t('sections.payouts')}>
                    <TRow cols={cols} min={620} head>
                      <div role="columnheader">{t('cols.period')}</div>
                      <div role="columnheader">{t('cols.status')}</div>
                      <div role="columnheader">{t('cols.items')}</div>
                      <div role="columnheader">{t('cols.total')}</div>
                      <div role="columnheader">{t('cols.created')}</div>
                    </TRow>
                    {page.data.map((b) => (
                      <TRow key={b.id} cols={cols} min={620} style={{ padding: '10px 0', fontSize: 12.5 }} selected={open === b.id}>
                        <div role="cell">
                          <button type="button" className="link" onClick={() => setOpen(b.id)}>
                            {b.period}
                          </button>
                        </div>
                        <div role="cell">
                          <Badge tone={batchTone(b.status)}>{t(`batchStatus.${b.status}`)}</Badge>
                        </div>
                        <div role="cell">{b.itemCount ?? 0}</div>
                        <div role="cell">{cents(b.total)}</div>
                        <div role="cell">{b.createdAt ? formatDate(b.createdAt) : '—'}</div>
                      </TRow>
                    ))}
                  </div>
                </div>
                <Pagination meta={page.meta} onPage={(n) => setUrl({ bpage: String(n) })} noun={t('payouts.noun')} />
              </>
            )
          }
        </QueryState>
      </Card>
      {open && <BatchDetail id={open} />}
    </>
  );
}

function BatchDetail({ id }: { id: string }) {
  const t = useT();
  const can = useCan();
  const me = useSession();
  const q = usePayoutBatch(id);
  const act = useBatchAction();
  const retry = useRetryPayout();
  const run = (action: 'approve' | 'send' | 'cancel') =>
    act.mutate(
      { id, action },
      { onSuccess: () => toast(tStatic(`toasts.${action === 'approve' ? 'approved' : action === 'send' ? 'sent' : 'canceled'}`)) },
    );
  return (
    <QueryState query={q} skeleton={<SkeletonRows rows={3} />}>
      {(b) => {
        const ownDraft = b.createdBy != null && b.createdBy === me.data?.id;
        return (
          <Card
            title={t('payouts.detail', { period: b.period })}
            right={<Badge tone={batchTone(b.status)}>{t(`batchStatus.${b.status}`)}</Badge>}
          >
            {b.needsSecondApprover && b.status === 'draft' && <p className="fg-warn t-sm">{t('payouts.secondApprover')}</p>}
            {(b.blocked ?? []).length > 0 && (
              <div className="t-sm" style={{ marginBottom: 10 }}>
                <p className="fg-warn">{t('payouts.blocked', { count: (b.blocked ?? []).length })}</p>
                <ul>
                  {(b.blocked ?? []).map((x) => (
                    <li key={x.id}>{t('payouts.blockedLine', { name: x.name ?? x.id, reason: x.reason })}</li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="plain-list">
              {(b.items ?? []).map((i) => (
                <li key={i.id} className="row hstack" style={{ justifyContent: 'space-between', padding: '8px 0', gap: 10 }}>
                  <span className="ellipsis">{i.payeeName ?? i.payeeId}</span>
                  <span className="hstack" style={{ gap: 8 }}>
                    <span>{t(`rails.${i.rail === 'paypal' ? 'paypal' : 'stripe'}`)}</span>
                    <strong>{cents(i.amount)}</strong>
                    <Badge tone={i.status === 'paid' ? 'good' : ['failed', 'returned'].includes(i.status) ? 'bad' : 'flat'}>
                      {ITEM_STATUSES.includes(i.status as (typeof ITEM_STATUSES)[number])
                        ? t(`itemStatus.${i.status as (typeof ITEM_STATUSES)[number]}`)
                        : i.status}
                    </Badge>
                    {can('partners.payout') && ['failed', 'returned'].includes(i.status) && (
                      <button type="button" className="btn btn--sm" disabled={retry.isPending} onClick={() => retry.mutate(i.id)}>
                        {t('payouts.retry')}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {can('partners.payout') && (
              <div className="hstack wrap" style={{ gap: 8, marginTop: 12 }}>
                {b.status === 'draft' && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={act.isPending || (b.needsSecondApprover && ownDraft)}
                    onClick={() => run('approve')}
                  >
                    {t('payouts.approve')}
                  </button>
                )}
                {['approved', 'funded', 'partially_failed'].includes(b.status) && (
                  <button type="button" className="btn btn--primary" disabled={act.isPending} onClick={() => run('send')}>
                    {t('payouts.send')}
                  </button>
                )}
                {['draft', 'approved'].includes(b.status) && (
                  <ConfirmButton confirmLabel={t('payouts.confirmCancel')} onConfirm={() => run('cancel')} disabled={act.isPending}>
                    {t('payouts.cancel')}
                  </ConfirmButton>
                )}
              </div>
            )}
          </Card>
        );
      }}
    </QueryState>
  );
}

export function TaxFormsSection() {
  const t = useT();
  const can = useCan();
  const [url, setUrl] = useUrlState({ tpage: '1' });
  const q = usePartnerTaxForms(Number(url.tpage) || 1);
  const review = useReviewTaxForm();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const cols = '1.4fr 90px 1.2fr 90px 110px 1.6fr';
  return (
    <Card
      title={t('sections.taxForms')}
      right={
        can('partners.payout') ? (
          <div className="hstack" style={{ gap: 6 }}>
            <Input
              aria-label={t('taxForms.exportYear')}
              inputMode="numeric"
              style={{ width: 80 }}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <button
              type="button"
              className="btn"
              onClick={() =>
                void api
                  .download('/partners/tax-forms/1099.csv', { year }, `partners-1099-nec-${year}.csv`)
                  .catch((e: unknown) => toast(errorMessage(e), 'error'))
              }
            >
              {t('taxForms.export')}
            </button>
          </div>
        ) : null
      }
    >
      <QueryState query={q} skeleton={<SkeletonRows rows={3} />}>
        {({ data, meta }) => (
          <>
            <p className="t-sm muted" style={{ marginBottom: 10 }}>
              {t('taxForms.threshold', { amount: cents(data.threshold * 100) })}
            </p>
            {data.forms.length === 0 ? (
              <Empty>{t('empty.taxForms')}</Empty>
            ) : (
              <>
                <div className="table-scroll">
                  <div role="table" aria-label={t('sections.taxForms')}>
                    <TRow cols={cols} min={760} head>
                      <div role="columnheader">{t('cols.partner')}</div>
                      <div role="columnheader">{t('cols.form')}</div>
                      <div role="columnheader">{t('cols.status')}</div>
                      <div role="columnheader">{t('cols.tin')}</div>
                      <div role="columnheader">{t('cols.signed')}</div>
                      <div role="columnheader">{t('cols.actions')}</div>
                    </TRow>
                    {data.forms.map((f) => (
                      <TRow key={f.id} cols={cols} min={760} style={{ padding: '10px 0', fontSize: 12.5 }}>
                        <div role="cell" className="ellipsis">
                          {f.partnerName ?? f.partnerId}
                          <div className="faint ellipsis">{f.legalName}</div>
                        </div>
                        <div role="cell">{t(`taxForms.kinds.${f.kind}`)}</div>
                        <div role="cell">
                          <Badge
                            tone={f.status === 'accepted' ? 'good' : f.status === 'rejected' || f.status === 'expired' ? 'bad' : 'info'}
                          >
                            {t(`taxForms.statuses.${f.status}`)}
                          </Badge>
                        </div>
                        <div role="cell" className="mono">
                          {f.tinLast4 ? `••${f.tinLast4}` : '—'}
                        </div>
                        <div role="cell">{f.signedAt ? formatDate(f.signedAt) : '—'}</div>
                        <div role="cell">
                          {can('partners.payout') && f.status === 'submitted' && (
                            <div className="hstack" style={{ gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn--sm btn--primary"
                                disabled={review.isPending}
                                onClick={() =>
                                  review.mutate({ id: f.id, accept: true }, { onSuccess: () => toast(tStatic('toasts.formAccepted')) })
                                }
                              >
                                {t('taxForms.accept')}
                              </button>
                              <Input
                                aria-label={t('taxForms.rejectNote')}
                                placeholder={t('taxForms.rejectNote')}
                                value={notes[f.id] ?? ''}
                                onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })}
                              />
                              <ConfirmButton
                                className="btn btn--sm btn--danger"
                                confirmLabel={t('taxForms.confirmReject')}
                                disabled={(notes[f.id] ?? '').trim().length < 3 || review.isPending}
                                onConfirm={() =>
                                  review.mutate(
                                    { id: f.id, accept: false, note: (notes[f.id] ?? '').trim() },
                                    { onSuccess: () => toast(tStatic('toasts.formRejected')) },
                                  )
                                }
                              >
                                {t('taxForms.reject')}
                              </ConfirmButton>
                            </div>
                          )}
                        </div>
                      </TRow>
                    ))}
                  </div>
                </div>
                <Pagination meta={meta} onPage={(n) => setUrl({ tpage: String(n) })} noun={t('taxForms.noun')} />
              </>
            )}
          </>
        )}
      </QueryState>
    </Card>
  );
}

type TermsDraft = Omit<PartnerTerms, 'recurring'> & { recurringMonths: number | null };
const toDraft = (s: PartnerTermsSettings): TermsDraft => {
  const { defaults: _d, lineKinds: _l, recurring, ...rest } = s;
  return { ...rest, recurringMonths: recurring === 'lifetime' ? null : recurring };
};

export function SettingsSection() {
  const q = usePartnerSettings();
  return (
    <QueryState query={q} skeleton={<SkeletonRows rows={6} />}>
      {(s) => <SettingsForm key={JSON.stringify(s)} settings={s} />}
    </QueryState>
  );
}

function SettingsForm({ settings }: { settings: PartnerTermsSettings }) {
  const t = useT();
  const can = useCan();
  const manage = can('partners.manage');
  const save = useUpdatePartnerSettings();
  const [draft, setDraft] = useState<TermsDraft>(toDraft(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
  const set = (patch: Partial<TermsDraft>) => setDraft({ ...draft, ...patch });
  const num = (
    k: keyof TermsDraft &
      ('commissionPct' | 'cookieDays' | 'holdDays' | 'clawbackMonths' | 'minPayoutUsd' | 'payoutDay' | 'dualApprovalUsd'),
  ) => (
    <Field label={t(`settings.${k}`)} error={errors[k]}>
      {(p) => (
        <Input
          {...p}
          inputMode="numeric"
          disabled={!manage}
          value={String(draft[k])}
          onChange={(e) => set({ [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })}
        />
      )}
    </Field>
  );
  const toggleList = <K extends 'rails' | 'excludedLineKinds'>(k: K, v: TermsDraft[K][number]) => {
    const list = draft[k] as string[];
    set({ [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  };
  const submit = () => {
    setErrors({});
    setFormError(null);
    const { recurringMonths, ...rest } = draft;
    save.mutate(
      { ...rest, recurring: recurringMonths === null ? 'lifetime' : recurringMonths },
      {
        onSuccess: () => toast(tStatic('toasts.termsSaved')),
        onError: (err) => {
          if (err instanceof ApiError && err.isValidation)
            setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
          else setFormError(errorMessage(err));
        },
      },
    );
  };
  return (
    <Card title={t('settings.title')} sub={t('settings.intro')}>
      <UnsavedChangesGuard when={dirty} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
        aria-label={t('settings.title')}
      >
        <div className="grid-3" style={{ gap: 14 }}>
          {num('commissionPct')}
          {num('cookieDays')}
          {num('holdDays')}
          {num('clawbackMonths')}
          {num('minPayoutUsd')}
          {num('payoutDay')}
          {num('dualApprovalUsd')}
          <Field label={t('settings.recurringMonths')} error={errors.recurring} hint={t('settings.lifetime')}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                disabled={!manage}
                placeholder={t('settings.lifetime')}
                value={draft.recurringMonths === null ? '' : String(draft.recurringMonths)}
                onChange={(e) => set({ recurringMonths: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) || null })}
              />
            )}
          </Field>
          <Field label={t('settings.attribution')} error={errors.attribution}>
            {(p) => (
              <select
                {...p}
                className="select"
                disabled={!manage}
                value={draft.attribution}
                onChange={(e) => set({ attribution: e.target.value === 'first_click' ? 'first_click' : 'last_click' })}
              >
                <option value="last_click">{t('settings.lastClick')}</option>
                <option value="first_click">{t('settings.firstClick')}</option>
              </select>
            )}
          </Field>
        </div>
        <fieldset style={{ marginTop: 14 }}>
          <legend className="field-label">{t('settings.rails')}</legend>
          <div className="hstack wrap" style={{ gap: 12 }}>
            {PAYOUT_RAILS.map((r) => (
              <label key={r} className="hstack" style={{ gap: 6 }}>
                <input type="checkbox" disabled={!manage} checked={draft.rails.includes(r)} onChange={() => toggleList('rails', r)} />
                {t(`rails.${r}`)}
              </label>
            ))}
          </div>
          {errors.rails && <div className="field-error">{errors.rails}</div>}
        </fieldset>
        <fieldset style={{ marginTop: 14 }}>
          <legend className="field-label">{t('settings.excluded')}</legend>
          <div className="hstack wrap" style={{ gap: 12 }}>
            {settings.lineKinds.map((k: LineKind) => (
              <label key={k} className="hstack" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  disabled={!manage || k === 'tax'}
                  checked={draft.excludedLineKinds.includes(k)}
                  onChange={() => toggleList('excludedLineKinds', k)}
                />
                {t(`settings.lineKinds.${k}`)}
              </label>
            ))}
          </div>
          {errors.excludedLineKinds && <div className="field-error">{errors.excludedLineKinds}</div>}
        </fieldset>
        {formError && <FormError>{formError}</FormError>}
        {manage && (
          <div className="hstack" style={{ gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn--primary" disabled={!dirty || save.isPending}>
              {t('settings.save')}
            </button>
            <button type="button" className="btn" disabled={!dirty} onClick={() => setDraft(toDraft(settings))}>
              {t('settings.discard')}
            </button>
          </div>
        )}
      </form>
    </Card>
  );
}
