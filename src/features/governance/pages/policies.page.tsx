import { Badge, Card, ConfirmButton, Empty, ErrorState, KpiRow, QueryState, Screen, Select, Skeleton, SkeletonRows } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { daysUntil, formatDate, formatDateTime, formatMonth, pct, timeAgo } from '@/lib/format';
import { useUrlState } from '@/lib/useUrlState';
import { toast } from '@/store/ui';
import { usePolicies, usePolicyAcceptance, usePublishPolicy, useRemindTenant } from '../api';
import { withinDay } from '../components/format';
import type { PolicyAcceptance, PolicyDocument, PolicyState } from '../types';

const STATE_TONE: Record<PolicyState, Tone> = { Live: 'good', Draft: 'warn', Superseded: 'flat' };

function docMeta(d: PolicyDocument) {
  if (d.state === 'Draft') return d.note;
  if (d.state === 'Superseded') return `${d.note} · published ${formatDate(d.publishedAt)}`;
  const left = d.acceptanceDeadline ? daysUntil(d.acceptanceDeadline) : 0;
  const window = left > 0 ? `acceptance window closes ${formatDate(d.acceptanceDeadline)}` : 'acceptance window closed';
  return `${d.note} · published ${formatDate(d.publishedAt)} · ${window}`;
}

function DocumentRow({ d }: { d: PolicyDocument }) {
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
        <span className="t-xs muted nowrap">
          {d.acceptance.accepted}/{d.acceptance.total} accepted
        </span>
      )}
      <Badge tone={STATE_TONE[d.state]} style={{ fontSize: 11 }}>
        {d.state}
      </Badge>
      {d.state === 'Draft' && can('governance.manage') && (
        <ConfirmButton
          className="btn btn--sm btn--primary"
          confirmLabel="Confirm publish"
          pending={publish.isPending}
          onConfirm={() =>
            publish.mutate(d.id, {
              onSuccess: () => toast(`${d.name} ${d.version} published — tenants have 30 days to accept before publishing is blocked`),
            })
          }
        >
          Publish
        </ConfirmButton>
      )}
    </li>
  );
}

function AcceptanceRow({ a, doc }: { a: PolicyAcceptance; doc: PolicyDocument }) {
  const can = useCan();
  const remind = useRemindTenant(doc.id);
  const recentlyReminded = !!a.lastRemindedAt && withinDay(a.lastRemindedAt);
  const left = doc.acceptanceDeadline ? daysUntil(doc.acceptanceDeadline) : 0;
  const sub = a.acceptedAt
    ? `${a.plan} · accepted ${formatDate(a.acceptedAt)}`
    : [
        a.plan,
        left > 0 ? `${left} day${left === 1 ? '' : 's'} left to accept` : 'Window closed — course publishing blocked',
        a.lastRemindedAt && `reminded ${timeAgo(a.lastRemindedAt)}${a.reminders > 1 ? ` (${a.reminders}×)` : ''}`,
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
          title={a.lastRemindedAt ? `Last reminder ${formatDateTime(a.lastRemindedAt)}` : undefined}
        >
          {sub}
        </div>
      </div>
      <Badge tone={a.acceptedAt ? 'good' : 'warn'} style={{ fontSize: 11, padding: '3px 8px' }}>
        {a.acceptedAt ? 'Accepted' : 'Pending'} {doc.version}
      </Badge>
      {!a.acceptedAt &&
        can('governance.manage') &&
        (recentlyReminded ? (
          <span className="faint nowrap" style={{ fontSize: 11, fontWeight: 700 }}>
            Reminder sent
          </span>
        ) : (
          <button
            type="button"
            className="link"
            style={{ fontSize: 11 }}
            disabled={remind.isPending}
            aria-label={`Remind ${a.tenantName}`}
            onClick={() =>
              remind.mutate(a.tenantId, {
                onSuccess: () => toast(`Reminder sent to ${a.tenantName} — a banner shows in their dashboard until they accept`),
              })
            }
          >
            Remind
          </button>
        ))}
    </li>
  );
}

function AcceptanceCard({ docs, doc, onDoc }: { docs: PolicyDocument[]; doc: PolicyDocument | undefined; onDoc: (key: string) => void }) {
  const q = usePolicyAcceptance(doc?.id);
  const accepted = q.data?.filter((a) => a.acceptedAt).length ?? 0;
  return (
    <Card
      title="Tenant acceptance"
      style={{ padding: '18px 20px' }}
      right={
        docs.length > 0 && doc ? (
          <Select
            value={doc.docKey}
            options={docs.map((d) => [d.docKey, `${d.name} ${d.version}`] as const)}
            label="Document"
            style={{ width: 'auto', maxWidth: '100%', padding: '5px 8px', fontSize: 12, marginLeft: 'auto' }}
            onChange={onDoc}
          />
        ) : undefined
      }
    >
      {!doc ? (
        <Empty>No live documents.</Empty>
      ) : (
        <QueryState query={q} skeleton={<SkeletonRows rows={6} h={26} />} compact>
          {(rows) => (
            <>
              <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
                {accepted} of {rows.length} tenants on {doc.name} {doc.version}
              </p>
              <ul className="plain-list" aria-label={`Acceptance of ${doc.name} ${doc.version}`}>
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
  const [f, setF] = useUrlState({ doc: 'tos' });
  const q = usePolicies();

  if (q.error)
    return (
      <Screen max={1250} label="Policies and terms">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );

  const docs = q.data?.documents ?? [];
  const liveDocs = docs.filter((d) => d.state === 'Live');
  const drafts = docs.filter((d) => d.state === 'Draft');
  const selected = liveDocs.find((d) => d.docKey === f.doc) ?? liveDocs[0];

  return (
    <Screen max={1250} label="Policies and terms">
      {q.data ? (
        <KpiRow
          items={[
            { label: 'Live documents', value: String(liveDocs.length), sub: 'ToS, DPA, AUP, student terms' },
            {
              label: 'Pending drafts',
              value: String(drafts.length),
              sub: drafts.length
                ? `${drafts.map((d) => `${d.name} ${d.version}`).join(', ')} awaiting publish`
                : 'Nothing awaiting publish',
            },
            {
              label: 'Acceptance',
              value: selected?.acceptance ? pct(selected.acceptance.accepted, selected.acceptance.total) : '—',
              sub: selected?.acceptance
                ? `${selected.acceptance.accepted} of ${selected.acceptance.total} tenants · ${selected.name} ${selected.version}`
                : 'No live document',
            },
            { label: 'Next review', value: formatMonth(q.data.nextReviewAt), sub: 'Annual legal review' },
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
        <Card title="Documents" style={{ padding: '14px 18px 4px' }}>
          {q.isPending ? (
            <SkeletonRows rows={5} h={30} />
          ) : docs.length === 0 ? (
            <Empty>No policy documents yet.</Empty>
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
            Publishing a new version supersedes the current one and starts a 30-day acceptance window. Tenants who haven’t accepted keep
            serving students but can’t publish new courses. A reminder never counts as acceptance.
          </div>
        </div>
      </div>
    </Screen>
  );
}
