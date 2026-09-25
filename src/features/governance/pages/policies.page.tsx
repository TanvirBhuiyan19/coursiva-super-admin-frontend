import { Badge, Card, ConfirmButton, Empty, ErrorState, KpiRow, QueryState, Screen, Select, Skeleton, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { daysUntil, formatDate, formatDateTime, formatMonth, pct, timeAgo } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { usePolicies, usePolicyAcceptance, usePublishPolicy, useRemindTenant } from '../api';
import { withinDay } from '../components/format';
import { t as tStatic, useT } from '../i18n';
import type { PolicyAcceptance, PolicyDocument, PolicyState } from '../types';

const STATE_TONE: Record<PolicyState, Tone> = { Live: 'good', Draft: 'warn', Superseded: 'flat' };

function docMeta(d: PolicyDocument) {
  if (d.state === 'Draft') return d.note;
  if (d.state === 'Superseded') return tStatic('policies.meta.superseded', { note: d.note, date: formatDate(d.publishedAt) });
  const left = d.acceptanceDeadline ? daysUntil(d.acceptanceDeadline) : 0;
  const window =
    left > 0 ? tStatic('policies.meta.windowCloses', { date: formatDate(d.acceptanceDeadline) }) : tStatic('policies.meta.windowClosed');
  return tStatic('policies.meta.live', { note: d.note, date: formatDate(d.publishedAt), window });
}

function DocumentRow({ d }: { d: PolicyDocument }) {
  const t = useT();
  const can = useCan();
  const publish = usePublishPolicy();
  return (
    <li className="row wrap t-sm" style={{ gap: 10, padding: '12px 0', opacity: d.state === 'Superseded' ? 0.7 : 1 }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div className="t-strong">
          {d.name}{' '}
          <span className="faint mono" style={{ fontSize: 11.5, fontWeight: 400 }}>
            {d.version}
          </span>
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
          {docMeta(d)}
        </div>
      </div>
      {d.acceptance && (
        <span className="t-xs muted nowrap">{t('policies.accepted', { accepted: d.acceptance.accepted, total: d.acceptance.total })}</span>
      )}
      <Badge tone={STATE_TONE[d.state]} style={{ fontSize: 11 }}>
        {t(`enums.policyState.${d.state}`)}
      </Badge>
      {d.state === 'Draft' && can('governance.manage') && (
        <ConfirmButton
          className="btn btn--sm btn--primary"
          confirmLabel={t('policies.confirmPublish')}
          pending={publish.isPending}
          onConfirm={() =>
            publish.mutate(d.id, {
              onSuccess: () => toast(t('policies.published', { name: d.name, version: d.version })),
            })
          }
        >
          {t('policies.publish')}
        </ConfirmButton>
      )}
    </li>
  );
}

function AcceptanceRow({ a, doc }: { a: PolicyAcceptance; doc: PolicyDocument }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const remind = useRemindTenant(doc.id);
  const recentlyReminded = !!a.lastRemindedAt && withinDay(a.lastRemindedAt);
  const left = doc.acceptanceDeadline ? daysUntil(doc.acceptanceDeadline) : 0;
  const plan = tc(`enums.plan.${a.plan}`);
  const sub = a.acceptedAt
    ? t('policies.acceptedOn', { plan, date: formatDate(a.acceptedAt) })
    : [
        plan,
        left > 0 ? t('policies.daysLeft', { count: left }) : t('policies.windowClosedBlocked'),
        a.lastRemindedAt &&
          (a.reminders > 1
            ? t('policies.remindedTimes', { when: timeAgo(a.lastRemindedAt), count: a.reminders })
            : t('policies.reminded', { when: timeAgo(a.lastRemindedAt) })),
      ]
        .filter(Boolean)
        .join(' · ');
  return (
    <li className="row t-sm" style={{ gap: 10 }}>
      <div className="min0" style={{ flex: 1 }}>
        <div className="ellipsis t-strong">{a.tenantName}</div>
        <div
          className="faint"
          style={{ fontSize: 11 }}
          title={a.lastRemindedAt ? t('policies.lastReminder', { when: formatDateTime(a.lastRemindedAt) }) : undefined}
        >
          {sub}
        </div>
      </div>
      <Badge tone={a.acceptedAt ? 'good' : 'warn'} style={{ fontSize: 11, padding: '3px 8px' }}>
        {t(a.acceptedAt ? 'policies.acceptedBadge' : 'policies.pendingBadge', { version: doc.version })}
      </Badge>
      {!a.acceptedAt &&
        can('governance.manage') &&
        (recentlyReminded ? (
          <span className="faint nowrap" style={{ fontSize: 11, fontWeight: 700 }}>
            {t('policies.reminderSent')}
          </span>
        ) : (
          <button
            type="button"
            className="link"
            style={{ fontSize: 11 }}
            disabled={remind.isPending}
            aria-label={t('policies.remindLabel', { tenant: a.tenantName })}
            onClick={() =>
              remind.mutate(a.tenantId, {
                onSuccess: () => toast(t('policies.remindToast', { tenant: a.tenantName })),
              })
            }
          >
            {t('policies.remind')}
          </button>
        ))}
    </li>
  );
}

function AcceptanceCard({ docs, doc, onDoc }: { docs: PolicyDocument[]; doc: PolicyDocument | undefined; onDoc: (key: string) => void }) {
  const t = useT();
  const q = usePolicyAcceptance(doc?.id);
  const accepted = q.data?.filter((a) => a.acceptedAt).length ?? 0;
  return (
    <Card
      title={t('policies.acceptance.title')}
      style={{ padding: '18px 20px' }}
      right={
        docs.length > 0 && doc ? (
          <Select
            value={doc.docKey}
            options={docs.map((d) => [d.docKey, t('policies.acceptance.docOption', { name: d.name, version: d.version })] as const)}
            label={t('policies.acceptance.document')}
            style={{ width: 'auto', maxWidth: '100%', padding: '5px 8px', fontSize: 12, marginLeft: 'auto' }}
            onChange={onDoc}
          />
        ) : undefined
      }
    >
      {!doc ? (
        <Empty>{t('policies.acceptance.noLive')}</Empty>
      ) : (
        <QueryState query={q} skeleton={<SkeletonRows rows={6} h={26} />} compact>
          {(rows) => (
            <>
              <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
                {t('policies.acceptance.summary', { accepted, total: rows.length, name: doc.name, version: doc.version })}
              </p>
              <ul className="plain-list" aria-label={t('policies.acceptance.listLabel', { name: doc.name, version: doc.version })}>
                {rows.map((a) => (
                  <AcceptanceRow key={a.tenantId} a={a} doc={doc} />
                ))}
              </ul>
            </>
          )}
        </QueryState>
      )}
    </Card>
  );
}

export default function PoliciesPage() {
  const t = useT();
  const [f, setF] = useUrlState({ doc: 'tos' });
  const q = usePolicies();

  if (q.error)
    return (
      <Screen max={1250} label={t('policies.title')}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const docs = q.data?.documents ?? [];
  const liveDocs = docs.filter((d) => d.state === 'Live');
  const drafts = docs.filter((d) => d.state === 'Draft');
  const selected = liveDocs.find((d) => d.docKey === f.doc) ?? liveDocs[0];

  return (
    <Screen max={1250} label={t('policies.title')}>
      {q.data ? (
        <KpiRow
          items={[
            { label: t('policies.kpi.live'), value: String(liveDocs.length), sub: t('policies.kpi.liveSub') },
            {
              label: t('policies.kpi.drafts'),
              value: String(drafts.length),
              sub: drafts.length
                ? t('policies.kpi.awaiting', {
                    drafts: drafts.map((d) => t('policies.acceptance.docOption', { name: d.name, version: d.version })).join(', '),
                  })
                : t('policies.kpi.nothingAwaiting'),
            },
            {
              label: t('policies.kpi.acceptance'),
              value: selected?.acceptance ? pct(selected.acceptance.accepted, selected.acceptance.total) : '—',
              sub: selected?.acceptance
                ? t('policies.kpi.acceptanceSub', {
                    accepted: selected.acceptance.accepted,
                    total: selected.acceptance.total,
                    name: selected.name,
                    version: selected.version,
                  })
                : t('policies.kpi.noLive'),
            },
            { label: t('policies.kpi.nextReview'), value: formatMonth(q.data.nextReviewAt), sub: t('policies.kpi.annual') },
          ]}
        />
      ) : (
        <div className="grid-kpi">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card card--tight">
              <Skeleton h={12} w="50%" />
              <Skeleton h={24} w="40%" style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}
      >
        <Card title={t('policies.documents')} style={{ padding: '14px 18px 4px' }}>
          {q.isPending ? (
            <SkeletonRows rows={5} h={30} />
          ) : docs.length === 0 ? (
            <Empty>{t('policies.noDocuments')}</Empty>
          ) : (
            <ul className="plain-list">
              {docs.map((d) => (
                <DocumentRow key={d.id} d={d} />
              ))}
            </ul>
          )}
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          {q.isPending ? (
            <div className="card">
              <SkeletonRows rows={6} h={26} />
            </div>
          ) : (
            <AcceptanceCard docs={liveDocs} doc={selected} onDoc={(doc) => setF({ doc })} />
          )}
          <div className="card note" style={{ padding: '16px 18px', fontSize: 12.5, lineHeight: 1.6 }}>
            {t('policies.note')}
          </div>
        </div>
      </div>
    </Screen>
  );
}
