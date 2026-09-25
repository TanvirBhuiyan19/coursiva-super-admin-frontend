import { useEffect, useState } from 'react';
import { Badge, Card, ConfirmButton, Empty, ErrorState, Pagination, Screen, SkeletonRows, ToggleRow, TRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatDate, num } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { useCertificateAction, useCertificates, useCertificateSummary, useRegistryPolicies, useSetRegistryPolicy } from '../api';
import { Tiles } from '../components/Tiles';
import type { Certificate, CertificateParams } from '../types';

const COLS = 'minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,1.5fr)';
const shortUrl = (url: string) => url.replace(/^https?:\/\//, '');

function CertificateRow({ c, canManage }: { c: Certificate; canManage: boolean }) {
  const act = useCertificateAction();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.verifyUrl);
      toast(`${shortUrl(c.verifyUrl)} copied`);
    } catch {
      toast('Couldn’t copy — select the link and copy it manually', 'error');
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
          {c.status}
        </Badge>
        <button
          type="button"
          className="link link--muted"
          style={{ fontSize: 11 }}
          aria-label={`Copy verify link for ${c.id}`}
          onClick={() => void copy()}
        >
          Copy link
        </button>
        {canManage &&
          (c.status === 'Revoked' ? (
            <button
              type="button"
              className="link"
              style={{ fontSize: 11 }}
              disabled={act.isPending}
              onClick={() =>
                act.mutate({ id: c.id, action: 'reinstate' }, { onSuccess: () => toast(`${c.id} reinstated — verifies as valid again`) })
              }
            >
              Reinstate
            </button>
          ) : (
            <ConfirmButton
              className="link"
              style={{ fontSize: 11, color: 'var(--rFg)' }}
              confirmLabel="Confirm revoke"
              pending={act.isPending}
              onConfirm={() =>
                act.mutate(
                  { id: c.id, action: 'revoke' },
                  { onSuccess: () => toast(`${c.id} revoked — the public verify page now reads “revoked”; holder and tenant notified`) },
                )
              }
            >
              Revoke
            </ConfirmButton>
          ))}
      </div>
    </TRow>
  );
}

function PolicyCard({ canManage }: { canManage: boolean }) {
  const policies = useRegistryPolicies();
  const set = useSetRegistryPolicy();
  return (
    <Card title="Registry policy" style={{ padding: '18px 20px' }}>
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
                  set.mutate({ key: p.key, enabled }, { onSuccess: () => toast(`${p.label} — ${enabled ? 'on' : 'off'} for every tenant`) })
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
    <Screen max={1250} label="Certificate authority">
      <Tiles
        items={
          s && [
            { label: 'Certificates issued', value: num(s.issued), sub: 'Across every tenant, all time' },
            { label: 'Verified · 30d', value: num(s.verified30d), sub: 'Public verify-page lookups' },
            { label: 'Revoked', value: num(s.revoked), sub: 'Fraud, error or course withdrawal' },
            { label: 'Orphaned', value: num(s.orphaned), sub: 'From closed tenants — still verifiable' },
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
            aria-label="Search certificates"
            placeholder="Search a certificate ID, learner, school or course…"
            style={{ fontSize: 12.5, padding: '8px 11px' }}
          />
          {list.error ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <div className="card table-scroll" style={{ padding: '6px 18px 4px' }} aria-busy={list.isFetching}>
              <div role="table" aria-label="Certificates">
                <TRow cols={COLS} min={720} head style={{ gap: 10, fontSize: 10.5 }}>
                  <div role="columnheader">Certificate</div>
                  <div role="columnheader">Learner</div>
                  <div role="columnheader">Course · school</div>
                  <div role="columnheader">Issued</div>
                  <div role="columnheader">Status</div>
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
                          Clear search
                        </button>
                      ) : undefined
                    }
                  >
                    {f.q ? 'No certificate matches that search.' : 'No certificates issued yet.'}
                  </Empty>
                )}
              </div>
              {list.data && list.data.meta.lastPage > 1 && (
                <Pagination meta={list.data.meta} noun="certificates" onPage={(p) => setF({ page: String(p) })} />
              )}
            </div>
          )}
        </div>

        <div className="stack min0" style={{ gap: 16, flex: '1 1 300px' }}>
          <PolicyCard canManage={canManage} />
          <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
            Certificates are issued under the platform registry at verify.coursiva.io, so a learner’s credential survives a tenant closing,
            rebranding or being suspended.
          </div>
        </div>
      </div>
    </Screen>
  );
}
