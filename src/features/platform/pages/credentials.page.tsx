import { useEffect, useState } from 'react';
import { Badge, Card, ConfirmButton, Empty, ErrorState, Pagination, Screen, SkeletonRows, ToggleRow, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDate, num } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useCertificateAction, useCertificates, useCertificateSummary, useRegistryPolicies, useSetRegistryPolicy } from '../api';
import { Tiles } from '../components/Tiles';
import { useT } from '../i18n';
import type { Certificate, CertificateParams } from '../types';

const COLS = 'minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,1.5fr)';
const shortUrl = (url: string) => url.replace(/^https?:\/\//, '');

function CertificateRow({ c, canManage }: { c: Certificate; canManage: boolean }) {
  const t = useT();
  const act = useCertificateAction();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.verifyUrl);
      toast(t('credentials.copied', { url: shortUrl(c.verifyUrl) }));
    } catch {
      toast(t('credentials.copyFailed'), 'error');
    }
  };
  return (
    <TRow cols={COLS} min={720} style={{ gap: 10, padding: '11px 0', fontSize: 12.5 }}>
      <div role="cell" className="min0">
        <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>
          {c.id}
        </div>
        <div className="faint ellipsis" style={{ fontSize: 10.5 }}>
          {shortUrl(c.verifyUrl)}
        </div>
      </div>
      <div role="cell" className="ellipsis" style={{ fontWeight: 600 }}>
        {c.learnerName}
      </div>
      <div role="cell" className="min0">
        <div className="ellipsis">{c.course}</div>
        <div className="faint ellipsis" style={{ fontSize: 10.5 }}>
          {c.tenantName}
        </div>
      </div>
      <div role="cell" className="muted nowrap">
        <time dateTime={c.issuedAt}>{formatDate(c.issuedAt)}</time>
      </div>
      <div role="cell" className="hstack wrap" style={{ gap: 8 }}>
        <Badge tone={c.status === 'Revoked' ? 'bad' : 'good'} style={{ fontSize: 11, padding: '3px 8px' }}>
          {t(`enums.certificateStatus.${c.status}`)}
        </Badge>
        <button
          type="button"
          className="link link--muted"
          style={{ fontSize: 11 }}
          aria-label={t('credentials.copyLinkLabel', { id: c.id })}
          onClick={() => void copy()}
        >
          {t('credentials.copyLink')}
        </button>
        {canManage &&
          (c.status === 'Revoked' ? (
            <button
              type="button"
              className="link"
              style={{ fontSize: 11 }}
              disabled={act.isPending}
              onClick={() =>
                act.mutate({ id: c.id, action: 'reinstate' }, { onSuccess: () => toast(t('credentials.reinstated', { id: c.id })) })
              }
            >
              {t('credentials.reinstate')}
            </button>
          ) : (
            <ConfirmButton
              className="link"
              style={{ fontSize: 11, color: 'var(--rFg)' }}
              confirmLabel={t('credentials.confirmRevoke')}
              pending={act.isPending}
              onConfirm={() =>
                act.mutate({ id: c.id, action: 'revoke' }, { onSuccess: () => toast(t('credentials.revokedToast', { id: c.id })) })
              }
            >
              {t('credentials.revoke')}
            </ConfirmButton>
          ))}
      </div>
    </TRow>
  );
}

function PolicyCard({ canManage }: { canManage: boolean }) {
  const t = useT();
  const policies = useRegistryPolicies();
  const set = useSetRegistryPolicy();
  return (
    <Card title={t('credentials.policyTitle')} style={{ padding: '18px 20px' }}>
      {policies.isPending ? (
        <SkeletonRows rows={4} h={22} />
      ) : policies.error ? (
        <ErrorState compact error={policies.error} onRetry={() => void policies.refetch()} />
      ) : (
        <ul className="plain-list">
          {policies.data.map((p) => (
            <li key={p.key}>
              <ToggleRow
                label={p.label}
                sub={p.description}
                on={p.enabled}
                disabled={!canManage}
                onChange={(enabled) =>
                  set.mutate(
                    { key: p.key, enabled },
                    { onSuccess: () => toast(t(enabled ? 'credentials.policyOn' : 'credentials.policyOff', { label: p.label })) },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CredentialsPage() {
  const t = useT();
  const can = useCan();
  const canManage = can('platform.manage');
  const [f, setF] = useUrlState({ q: '', page: '1' });
  const [search, setSearch] = useState(f.q);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.q) setF({ q: debounced });
  }, [debounced, f.q, setF]);

  const params: CertificateParams = { page: Number(f.page) || 1, perPage: 25, ...(f.q ? { search: f.q } : {}) };
  const list = useCertificates(params);
  const summary = useCertificateSummary();
  const s = summary.data;
  const rows = list.data?.data ?? [];

  return (
    <Screen max={1250} label={t('credentials.screenLabel')}>
      <Tiles
        items={
          s && [
            { label: t('credentials.tiles.issued'), value: num(s.issued), sub: t('credentials.tiles.issuedSub') },
            { label: t('credentials.tiles.verified'), value: num(s.verified30d), sub: t('credentials.tiles.verifiedSub') },
            { label: t('credentials.tiles.revoked'), value: num(s.revoked), sub: t('credentials.tiles.revokedSub') },
            { label: t('credentials.tiles.orphaned'), value: num(s.orphaned), sub: t('credentials.tiles.orphanedSub') },
          ]
        }
      />

      <div className="hstack wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="stack min0" style={{ gap: 12, flex: '1.7 1 600px' }}>
          <input
            className="input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('credentials.searchLabel')}
            placeholder={t('credentials.searchPlaceholder')}
            style={{ fontSize: 12.5, padding: '8px 11px' }}
          />
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <div className="card table-scroll" style={{ padding: '6px 18px 4px' }} aria-busy={list.isFetching}>
              <div role="table" aria-label={t('credentials.table')}>
                <TRow cols={COLS} min={720} head style={{ gap: 10, fontSize: 10.5 }}>
                  <div role="columnheader">{t('credentials.cols.certificate')}</div>
                  <div role="columnheader">{t('credentials.cols.learner')}</div>
                  <div role="columnheader">{t('credentials.cols.courseSchool')}</div>
                  <div role="columnheader">{t('credentials.cols.issued')}</div>
                  <div role="columnheader">{t('credentials.cols.status')}</div>
                </TRow>
                {list.isPending && <SkeletonRows rows={5} h={22} />}
                {rows.map((c) => (
                  <CertificateRow key={c.id} c={c} canManage={canManage} />
                ))}
                {list.isSuccess && rows.length === 0 && (
                  <Empty
                    action={
                      f.q ? (
                        <button type="button" className="btn btn--sm" onClick={() => setSearch('')}>
                          {t('credentials.clearSearch')}
                        </button>
                      ) : undefined
                    }
                  >
                    {f.q ? t('credentials.noMatch') : t('credentials.empty')}
                  </Empty>
                )}
              </div>
              {list.data && list.data.meta.lastPage > 1 && (
                <Pagination meta={list.data.meta} noun={t('credentials.noun')} onPage={(p) => setF({ page: String(p) })} />
              )}
            </div>
          )}
        </div>

        <div className="stack min0" style={{ gap: 16, flex: '1 1 300px' }}>
          <PolicyCard canManage={canManage} />
          <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
            {t('credentials.note')}
          </div>
        </div>
      </div>
    </Screen>
  );
}
