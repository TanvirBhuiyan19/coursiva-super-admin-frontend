// Email deliverability → sender reputation: Coursiva Mail's sending IPs (shared pool and dedicated, checked daily on
// Spamhaus ZEN) and the schools' dedicated IP requests. A dedicated Postmark server token is write-only.
import { useId, useState } from 'react';
import { Badge, Card, ConfirmButton, Empty, Field, FormError, Input, SkeletonRows, Spinner, TRow } from '@/components/ui';
import { Pagination } from '@/components/ui/Pagination';
import { ApiError } from '@/lib/api/errors';
import type { Tone } from '@/lib/domain';
import { num, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useAddSendingIp, useDedicatedIpAction, useDedicatedIpRequests, useRemoveSendingIp, useSendingIps } from '../api';
import { useT } from '../i18n';
import type { BlocklistCheck, DedicatedIpRequest, DedicatedIpStatus, SendingIp } from '../types';

const BL_TONE: Record<BlocklistCheck, Tone> = { clear: 'good', listed: 'bad', unknown: 'warn' };
const REQ_TONE: Record<DedicatedIpStatus, Tone> = {
  requested: 'warn',
  active: 'good',
  rejected: 'flat',
  cancelled: 'flat',
  released: 'flat',
};
const IP_COLS = 'minmax(0,1.1fr) minmax(0,0.7fr) minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,0.6fr)';
const IP_FIELDS = ['ip', 'kind', 'tenantId', 'label'];
const PROVISION_FIELDS = ['ip', 'serverToken', 'messageStream'];
const fieldErr = (e: unknown, f: string) => (e instanceof ApiError ? e.field(f) : undefined);
const otherErr = (e: unknown, fields: string[]) =>
  e instanceof ApiError && !fields.some((f) => e.field(f)) ? e.message : e instanceof Error ? e.message : undefined;

export function BlocklistBadge({ status }: { status: BlocklistCheck }) {
  const t = useT();
  return (
    <Badge tone={BL_TONE[status]} style={{ fontSize: 11, padding: '3px 8px' }}>
      {t(`deliver.rep.bl.${status}`)}
    </Badge>
  );
}

function IpRow({ ip, canManage }: { ip: SendingIp; canManage: boolean }) {
  const t = useT();
  const remove = useRemoveSendingIp();
  return (
    <TRow cols={IP_COLS} min={720} style={{ gap: 10, padding: '10px 0', fontSize: 12.5 }}>
      <div role="cell" style={{ fontWeight: 600 }}>
        {ip.ip}
      </div>
      <div role="cell">{t(`deliver.rep.kind.${ip.kind}`)}</div>
      <div role="cell" className="min0 ellipsis">
        {ip.kind === 'dedicated' ? (ip.tenantName ?? '') : (ip.label ?? t('deliver.rep.pool'))}
      </div>
      <div role="cell" className="hstack wrap" style={{ gap: 6 }}>
        {ip.blocklist ? (
          <>
            <BlocklistBadge status={ip.blocklist.status} />
            <span className="faint" style={{ fontSize: 11 }}>
              {ip.blocklist.codes ?? timeAgo(ip.blocklist.checkedAt)}
            </span>
          </>
        ) : (
          <span className="faint">{t('deliver.rep.notChecked')}</span>
        )}
      </div>
      <div role="cell">
        {canManage && (
          <ConfirmButton
            className="link link--muted"
            style={{ fontSize: 11 }}
            confirmLabel={t('deliver.rep.removeConfirm')}
            pending={remove.isPending}
            onConfirm={() => remove.mutate(ip.id, { onSuccess: () => toast(t('deliver.rep.removed', { ip: ip.ip })) })}
          >
            {t('deliver.rep.remove')}
          </ConfirmButton>
        )}
      </div>
    </TRow>
  );
}

function AddIp({ monitored }: { monitored: boolean }) {
  const t = useT();
  const add = useAddSendingIp();
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  return (
    <form
      noValidate
      className="hstack wrap"
      style={{ gap: 10, alignItems: 'flex-end', marginTop: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(
          { ip: ip.trim(), kind: 'pool', ...(label.trim() ? { label: label.trim() } : {}) },
          {
            onSuccess: (r) => {
              setIp('');
              setLabel('');
              // The Spamhaus check is promised only when Spamhaus DQS is connected.
              toast(t(monitored ? 'deliver.rep.added' : 'deliver.rep.addedUnmonitored', { ip: r.ip }));
            },
          },
        );
      }}
    >
      <Field label={t('deliver.rep.ip')} error={fieldErr(add.error, 'ip')} style={{ flex: '1 1 160px' }}>
        {(p) => <Input {...p} value={ip} placeholder={t('deliver.rep.ipPlaceholder')} onChange={(e) => setIp(e.target.value)} />}
      </Field>
      <Field label={t('deliver.rep.label')} style={{ flex: '1 1 160px' }}>
        {(p) => <Input {...p} value={label} onChange={(e) => setLabel(e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn--primary" disabled={add.isPending}>
        {add.isPending && <Spinner />} {t('deliver.rep.add')}
      </button>
      <FormError>{otherErr(add.error, IP_FIELDS)}</FormError>
    </form>
  );
}

export function SendingIps({ canManage, monitored }: { canManage: boolean; monitored: boolean }) {
  const t = useT();
  const q = useSendingIps();
  return (
    <Card title={t('deliver.rep.ipsTitle')} style={{ padding: '18px 20px' }}>
      <p className="muted t-sm" style={{ margin: '0 0 6px' }}>
        {monitored ? t('deliver.rep.ipsIntro') : t('deliver.rep.notMonitored')}
      </p>
      <div className="table-scroll">
        <div role="table" aria-label={t('deliver.rep.ipsTitle')}>
          <TRow cols={IP_COLS} min={720} head style={{ gap: 10, fontSize: 10.5 }}>
            <div role="columnheader">{t('deliver.rep.cols.ip')}</div>
            <div role="columnheader">{t('deliver.rep.cols.kind')}</div>
            <div role="columnheader">{t('deliver.rep.cols.owner')}</div>
            <div role="columnheader">{t('deliver.rep.cols.zen')}</div>
            <div role="columnheader">
              <span className="sr-only">{t('deliver.rep.cols.actions')}</span>
            </div>
          </TRow>
          {q.isPending && <SkeletonRows rows={3} h={20} />}
          {q.data?.map((ip) => (
            <IpRow key={ip.id} ip={ip} canManage={canManage} />
          ))}
          {q.data?.length === 0 && <Empty>{t('deliver.rep.noIps')}</Empty>}
        </div>
      </div>
      {canManage && <AddIp monitored={monitored} />}
    </Card>
  );
}

function Provision({ r, onDone }: { r: DedicatedIpRequest; onDone: () => void }) {
  const t = useT();
  const act = useDedicatedIpAction();
  const [ip, setIp] = useState(r.ip ?? '');
  const [token, setToken] = useState('');
  const hintId = useId();
  return (
    <form
      noValidate
      className="hstack wrap"
      style={{ gap: 10, alignItems: 'flex-end', marginTop: 8 }}
      onSubmit={(e) => {
        e.preventDefault();
        act.mutate(
          { id: r.id, action: 'provision', input: { ip: ip.trim(), serverToken: token.trim() } },
          {
            onSuccess: () => {
              setToken('');
              toast(t('deliver.rep.provisioned', { tenant: r.tenantName }));
              onDone();
            },
          },
        );
      }}
    >
      <Field label={t('deliver.rep.ip')} error={fieldErr(act.error, 'ip')} style={{ flex: '1 1 140px' }}>
        {(p) => <Input {...p} value={ip} placeholder={t('deliver.rep.ipPlaceholder')} onChange={(e) => setIp(e.target.value)} />}
      </Field>
      {/* The token's hint sits under the whole row (not inside its field), so both inputs and the button line up. */}
      <Field label={t('deliver.rep.token')} error={fieldErr(act.error, 'serverToken')} style={{ flex: '2 1 220px' }}>
        {(p) => (
          <Input
            {...p}
            aria-describedby={[p['aria-describedby'], hintId].filter(Boolean).join(' ')}
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        )}
      </Field>
      <button type="submit" className="btn btn--primary" disabled={act.isPending}>
        {act.isPending && <Spinner />} {t('deliver.rep.provision')}
      </button>
      <p id={hintId} className="field-hint" style={{ flexBasis: '100%', margin: 0 }}>
        {t('deliver.rep.tokenHint')}
      </p>
      <FormError>{otherErr(act.error, PROVISION_FIELDS)}</FormError>
    </form>
  );
}

function Request({ r, canManage }: { r: DedicatedIpRequest; canManage: boolean }) {
  const t = useT();
  const act = useDedicatedIpAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <li className="row" style={{ display: 'block', padding: '12px 0', fontSize: 12.5 }}>
      <div className="hstack wrap" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600, flex: 1 }}>{r.tenantName}</span>
        <Badge tone={REQ_TONE[r.status]} style={{ fontSize: 11, padding: '3px 8px' }}>
          {t(`deliver.rep.status.${r.status}`)}
        </Badge>
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
        {t('deliver.rep.requestedBy', { name: r.requestedBy, email: r.requestedByEmail, when: timeAgo(r.requestedAt), plan: r.tenantPlan })}
      </div>
      {r.note && <p style={{ margin: '6px 0 0' }}>{r.note}</p>}
      {r.status === 'active' && (
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {r.dailyCap === null
            ? t('deliver.rep.activeWarm', { ip: r.ip ?? '' })
            : t('deliver.rep.activeCap', { ip: r.ip ?? '', sent: num(r.sentToday), cap: num(r.dailyCap) })}
        </p>
      )}
      {r.status === 'rejected' && r.reason && (
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {r.reason}
        </p>
      )}
      {canManage && (r.status === 'requested' || r.status === 'active') && (
        <div className="hstack wrap" style={{ gap: 12, marginTop: 8 }}>
          <button type="button" className="link" style={{ fontSize: 11 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {r.status === 'active' ? t('deliver.rep.replace') : t('deliver.rep.provision')}
          </button>
          {r.status === 'active' && (
            <ConfirmButton
              className="link link--muted"
              style={{ fontSize: 11 }}
              confirmLabel={t('deliver.rep.releaseConfirm')}
              pending={act.isPending}
              onConfirm={() =>
                act.mutate({ id: r.id, action: 'release' }, { onSuccess: () => toast(t('deliver.rep.released', { tenant: r.tenantName })) })
              }
            >
              {t('deliver.rep.release')}
            </ConfirmButton>
          )}
        </div>
      )}
      {open && <Provision r={r} onDone={() => setOpen(false)} />}
      {open && r.status === 'requested' && (
        <form
          noValidate
          className="hstack wrap"
          style={{ gap: 10, alignItems: 'flex-end', marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            act.mutate(
              { id: r.id, action: 'reject', reason: reason.trim() },
              { onSuccess: () => toast(t('deliver.rep.declined', { tenant: r.tenantName })) },
            );
          }}
        >
          <Field label={t('deliver.rep.reason')} error={fieldErr(act.error, 'reason')} style={{ flex: '1 1 260px' }}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <button type="submit" className="btn" disabled={act.isPending}>
            {t('deliver.rep.decline')}
          </button>
        </form>
      )}
    </li>
  );
}

export function DedicatedRequests({ canManage }: { canManage: boolean }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const q = useDedicatedIpRequests(page);
  return (
    <Card title={t('deliver.rep.requestsTitle')} style={{ padding: '18px 20px' }}>
      <p className="muted t-sm" style={{ margin: '0 0 4px' }}>
        {t('deliver.rep.requestsIntro')}
      </p>
      {q.isPending ? (
        <SkeletonRows rows={3} h={20} />
      ) : q.data?.data.length ? (
        <>
          <ul className="plain-list">
            {q.data.data.map((r) => (
              <Request key={r.id} r={r} canManage={canManage} />
            ))}
          </ul>
          <Pagination meta={q.data.meta} onPage={setPage} />
        </>
      ) : (
        <Empty>{t('deliver.rep.noRequests')}</Empty>
      )}
    </Card>
  );
}
