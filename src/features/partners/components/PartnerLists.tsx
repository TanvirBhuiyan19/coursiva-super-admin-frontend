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
  Select,
  SkeletonRows,
  TRow,
} from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import {
  usePartnerAction,
  usePartnerCommissions,
  usePartnerReferrals,
  usePartners,
  useAttributeReferral,
  useReverseCommission,
  useVoidReferral,
} from '../api';
import { cents, statusTone } from '../format';
import { t as tStatic, useT } from '../i18n';
import { COMMISSION_STATUSES, PARTNER_STATUSES, type CommissionStatus, type Partner, type PartnerStatus } from '../types';

/** Applications (Pending, email confirmed) or every partner, with search and status filters in the URL. */
export function PartnerTable({ applications, onOpen }: { applications: boolean; onOpen: (id: string) => void }) {
  const t = useT();
  const can = useCan();
  const act = usePartnerAction();
  const [url, setUrl] = useUrlState({ page: '1', q: '', status: '' });
  const search = useDebounced(url.q, 250);
  const q = usePartners({
    page: Number(url.page),
    search: search || undefined,
    status: applications ? '' : (url.status as PartnerStatus | ''),
    applications,
  });
  const decide = (p: Partner, action: 'approve' | 'decline') =>
    act.mutate({ id: p.id, action }, { onSuccess: () => toast(tStatic(`toasts.${action}`, { name: p.name })) });
  const cols = applications ? '1.4fr 1.6fr 1fr 220px' : '1.4fr 1.6fr 100px 80px 110px 100px';

  return (
    <Card title={applications ? t('sections.applications') : t('sections.partners')}>
      {!applications && (
        <div className="hstack wrap" style={{ gap: 10, marginBottom: 12 }}>
          <Input
            aria-label={t('search')}
            placeholder={t('search')}
            value={url.q}
            onChange={(e) => setUrl({ q: e.target.value, page: '1' })}
          />
          <Select
            label={t('filterStatus')}
            value={url.status}
            onChange={(v) => setUrl({ status: v, page: '1' })}
            options={[['', t('allStatuses')] as const, ...PARTNER_STATUSES.map((s) => [s, t(`status.${s}`)] as const)]}
          />
        </div>
      )}
      <QueryState query={q} skeleton={<SkeletonRows rows={4} />}>
        {(page) =>
          page.data.length === 0 ? (
            <Empty>{applications ? t('empty.applications') : t('empty.partners')}</Empty>
          ) : (
            <div className="table-scroll">
              <div role="table" aria-label={applications ? t('sections.applications') : t('sections.partners')}>
                <TRow cols={cols} min={640} head>
                  <div role="columnheader">{t('cols.partner')}</div>
                  <div role="columnheader">{t('cols.email')}</div>
                  {applications ? (
                    <div role="columnheader">{t('cols.applied')}</div>
                  ) : (
                    <>
                      <div role="columnheader">{t('cols.status')}</div>
                      <div role="columnheader">{t('cols.rate')}</div>
                      <div role="columnheader">{t('cols.code')}</div>
                    </>
                  )}
                  <div role="columnheader">{t('cols.actions')}</div>
                </TRow>
                {page.data.map((p) => (
                  <TRow key={p.id} cols={cols} min={640} style={{ padding: '10px 0', fontSize: 12.5 }}>
                    <div role="cell" className="min0">
                      <button
                        type="button"
                        className="link ellipsis"
                        onClick={() => onOpen(p.id)}
                        aria-label={t('actions.open', { name: p.name })}
                      >
                        {p.name}
                      </button>
                      {applications && p.audience && <div className="faint ellipsis">{p.audience}</div>}
                    </div>
                    <div role="cell" className="muted ellipsis">
                      {p.email}
                    </div>
                    {applications ? (
                      <div role="cell">{p.createdAt ? formatDate(p.createdAt) : '—'}</div>
                    ) : (
                      <>
                        <div role="cell">
                          <Badge tone={statusTone(p.status)}>{t(`status.${p.status}`)}</Badge>
                        </div>
                        <div role="cell">{`${String(p.commissionPct)}%`}</div>
                        <div role="cell" className="mono ellipsis">
                          {p.couponCode ?? '—'}
                        </div>
                      </>
                    )}
                    <div role="cell" className="hstack" style={{ gap: 6 }}>
                      {applications && can('partners.manage') ? (
                        <>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={act.isPending}
                            onClick={() => decide(p, 'approve')}
                          >
                            {t('actions.approve')}
                          </button>
                          <ConfirmButton
                            className="btn btn--sm"
                            confirmLabel={t('actions.confirmDecline')}
                            onConfirm={() => decide(p, 'decline')}
                            disabled={act.isPending}
                          >
                            {t('actions.decline')}
                          </ConfirmButton>
                        </>
                      ) : (
                        <button type="button" className="btn btn--sm" onClick={() => onOpen(p.id)}>
                          {t('actions.view')}
                        </button>
                      )}
                    </div>
                  </TRow>
                ))}
              </div>
              <Pagination meta={page.meta} onPage={(n) => setUrl({ page: String(n) })} />
            </div>
          )
        }
      </QueryState>
    </Card>
  );
}

export function ReferralsSection() {
  const t = useT();
  const can = useCan();
  const [url, setUrl] = useUrlState({ rpage: '1', rstatus: '' });
  const q = usePartnerReferrals({ page: Number(url.rpage), status: url.rstatus as '' | 'active' | 'void' });
  const voidRef = useVoidReferral();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const cols = '1.4fr 1.2fr 100px 110px 1.4fr';
  return (
    <>
      <Card
        title={t('sections.referrals')}
        right={
          <Select
            label={t('cols.status')}
            style={{ width: 'auto' }}
            value={url.rstatus}
            onChange={(v) => setUrl({ rstatus: v, rpage: '1' })}
            options={[
              ['', t('referrals.filterAll')] as const,
              ['active', t('referrals.filterActive')] as const,
              ['void', t('referrals.filterVoid')] as const,
            ]}
          />
        }
      >
        <QueryState query={q} skeleton={<SkeletonRows rows={4} />}>
          {(page) =>
            page.data.length === 0 ? (
              <Empty>{t('empty.referrals')}</Empty>
            ) : (
              <div className="table-scroll">
                <div role="table" aria-label={t('sections.referrals')}>
                  <TRow cols={cols} min={720} head>
                    <div role="columnheader">{t('cols.school')}</div>
                    <div role="columnheader">{t('cols.partner')}</div>
                    <div role="columnheader">{t('cols.source')}</div>
                    <div role="columnheader">{t('cols.attributed')}</div>
                    <div role="columnheader">{t('cols.actions')}</div>
                  </TRow>
                  {page.data.map((r) => (
                    <TRow key={r.tenantId} cols={cols} min={720} style={{ padding: '10px 0', fontSize: 12.5 }}>
                      <div role="cell" className="min0">
                        <div className="ellipsis">{r.tenantName ?? r.tenantId}</div>
                        <div className="faint">{r.plan ?? ''}</div>
                      </div>
                      <div role="cell" className="ellipsis">
                        {r.partnerName}
                      </div>
                      <div role="cell">{t(`source.${r.source}`)}</div>
                      <div role="cell">{r.attributedAt ? formatDate(r.attributedAt) : '—'}</div>
                      <div role="cell" className="min0">
                        {r.voidReason ? (
                          <Badge tone="bad">{t('referrals.voided', { reason: r.voidReason })}</Badge>
                        ) : r.selfReferral ? (
                          <Badge tone="warn">{t('referrals.self')}</Badge>
                        ) : can('partners.manage') ? (
                          <div className="hstack" style={{ gap: 6 }}>
                            <Input
                              aria-label={t('referrals.voidReason')}
                              placeholder={t('referrals.voidReason')}
                              value={reasons[r.tenantId] ?? ''}
                              onChange={(e) => setReasons({ ...reasons, [r.tenantId]: e.target.value })}
                            />
                            <ConfirmButton
                              className="btn btn--sm btn--danger"
                              confirmLabel={t('referrals.confirmVoid')}
                              disabled={(reasons[r.tenantId] ?? '').trim().length < 3 || voidRef.isPending}
                              onConfirm={() =>
                                voidRef.mutate(
                                  { tenantId: r.tenantId, reason: (reasons[r.tenantId] ?? '').trim() },
                                  { onSuccess: (d) => toast(tStatic('toasts.voided', { amount: cents(d.reversed) })) },
                                )
                              }
                            >
                              {t('referrals.void')}
                            </ConfirmButton>
                          </div>
                        ) : null}
                      </div>
                    </TRow>
                  ))}
                </div>
                <Pagination meta={page.meta} onPage={(n) => setUrl({ rpage: String(n) })} />
              </div>
            )
          }
        </QueryState>
      </Card>
      {can('partners.manage') && <AttributeForm />}
    </>
  );
}

function AttributeForm() {
  const t = useT();
  const attribute = useAttributeReferral();
  const partners = usePartners({ status: 'Active', page: 1, perPage: 100 });
  const [tenantId, setTenantId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submit = () => {
    setErrors({});
    setFormError(null);
    attribute.mutate(
      { tenantId: tenantId.trim(), partnerId, reason: reason.trim() },
      {
        onSuccess: () => {
          const partner = partners.data?.data.find((p) => p.id === partnerId)?.name ?? '';
          toast(tStatic('toasts.attributed', { school: tenantId.trim(), partner }));
          setTenantId('');
          setReason('');
        },
        onError: (err) => {
          if (err instanceof ApiError && err.isValidation)
            setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
          else setFormError(errorMessage(err));
        },
      },
    );
  };
  return (
    <Card title={t('referrals.attributeTitle')}>
      <form
        className="grid-3"
        style={{ gap: 12, alignItems: 'end' }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Field label={t('referrals.tenant')} error={errors.tenantId}>
          {(p) => <Input {...p} value={tenantId} onChange={(e) => setTenantId(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label={t('referrals.partner')} error={errors.partnerId}>
          {(p) => (
            <select {...p} className="select" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">{t('allStatuses')}</option>
              {(partners.data?.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('referrals.reason')} error={errors.reason}>
          {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          {formError && <FormError>{formError}</FormError>}
          <button type="submit" className="btn btn--primary" disabled={attribute.isPending}>
            {t('referrals.attribute')}
          </button>
        </div>
      </form>
    </Card>
  );
}

export function CommissionsSection() {
  const t = useT();
  const can = useCan();
  const [url, setUrl] = useUrlState({ cpage: '1', cstatus: '' });
  const q = usePartnerCommissions({ page: Number(url.cpage), status: url.cstatus as CommissionStatus | '' });
  const reverse = useReverseCommission();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const cols = '1fr 1.2fr 1.2fr 100px 100px 90px 1.3fr';
  return (
    <Card
      title={t('sections.commissions')}
      right={
        <Select
          label={t('cols.status')}
          style={{ width: 'auto' }}
          value={url.cstatus}
          onChange={(v) => setUrl({ cstatus: v, cpage: '1' })}
          options={[['', t('allStatuses')] as const, ...COMMISSION_STATUSES.map((s) => [s, t(`commissionStatus.${s}`)] as const)]}
        />
      }
    >
      <QueryState query={q} skeleton={<SkeletonRows rows={5} />}>
        {(page) =>
          page.data.length === 0 ? (
            <Empty>{t('empty.commissions')}</Empty>
          ) : (
            <div className="table-scroll">
              <div role="table" aria-label={t('sections.commissions')}>
                <TRow cols={cols} min={900} head>
                  <div role="columnheader">{t('cols.invoice')}</div>
                  <div role="columnheader">{t('cols.partner')}</div>
                  <div role="columnheader">{t('cols.school')}</div>
                  <div role="columnheader">{t('cols.amount')}</div>
                  <div role="columnheader">{t('cols.due')}</div>
                  <div role="columnheader">{t('cols.status')}</div>
                  <div role="columnheader">{t('cols.actions')}</div>
                </TRow>
                {page.data.map((c) => (
                  <TRow key={c.id} cols={cols} min={900} style={{ padding: '10px 0', fontSize: 12.5 }}>
                    <div role="cell" className="mono ellipsis">
                      {c.invoiceNumber ?? c.invoiceId}
                    </div>
                    <div role="cell" className="ellipsis">
                      {c.partnerName}
                    </div>
                    <div role="cell" className="ellipsis">
                      {c.school ?? '—'}
                    </div>
                    <div role="cell">{cents(c.amount - c.reversedAmount)}</div>
                    <div role="cell" className={c.due < 0 ? 'fg-bad' : undefined}>
                      {cents(c.due)}
                    </div>
                    <div role="cell">
                      <Badge tone={c.status === 'reversed' ? 'bad' : c.status === 'paid' ? 'good' : c.status === 'owed' ? 'info' : 'flat'}>
                        {c.frozen ? t('commissions.frozen') : t(`commissionStatus.${c.status}`)}
                      </Badge>
                    </div>
                    <div role="cell">
                      {can('partners.payout') && c.reversedAmount < c.amount && (
                        <div className="hstack" style={{ gap: 6 }}>
                          <Input
                            aria-label={t('commissions.reverseAmount')}
                            placeholder={t('commissions.cents')}
                            inputMode="numeric"
                            style={{ width: 90 }}
                            value={amounts[c.id] ?? ''}
                            onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value.replace(/\D/g, '') })}
                          />
                          <ConfirmButton
                            className="btn btn--sm"
                            confirmLabel={t('commissions.confirmReverse')}
                            disabled={!Number(amounts[c.id]) || reverse.isPending}
                            onConfirm={() =>
                              reverse.mutate(
                                { id: c.id, amount: Number(amounts[c.id]), reason: 'Manual reversal (console)' },
                                { onSuccess: (d) => toast(tStatic('toasts.reversed', { amount: cents(d.reversed) })) },
                              )
                            }
                          >
                            {t('commissions.reverse')}
                          </ConfirmButton>
                        </div>
                      )}
                    </div>
                  </TRow>
                ))}
              </div>
              <Pagination meta={page.meta} onPage={(n) => setUrl({ cpage: String(n) })} />
            </div>
          )
        }
      </QueryState>
    </Card>
  );
}
