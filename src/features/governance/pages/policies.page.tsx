import { useEffect, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Card,
  ConfirmButton,
  Empty,
  ErrorState,
  Field,
  Input,
  KpiRow,
  Pagination,
  QueryState,
  Screen,
  Select,
  Skeleton,
  SkeletonRows,
  Spinner,
} from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import type { Tone } from '@/lib/domain';
import { daysUntil, formatDate, formatDateTime, formatMonth, pct, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/useDebounced';
import { useSection } from '@/lib/useSection';
import { useUrlState } from '@/lib/useUrlState';
import { useT as useCommonT } from '@/lib/i18n/common';
import { toast } from '@/store/ui';
import { useDraftPolicy, usePolicies, usePolicyAcceptance, usePublishPolicy, useRemindTenant } from '../api';
import { withinDay } from '../components/format';
import { t as tStatic, useT } from '../i18n';
import { POLICY_FAMILIES, type PolicyAcceptance, type PolicyDocument, type PolicyFamily, type PolicyState } from '../types';

const SECTIONS = ['documents', 'acceptance'] as const;

const STATE_TONE: Record<PolicyState, Tone> = { Live: 'good', Draft: 'warn', Superseded: 'flat' };

function docMeta(d: PolicyDocument) {
  const note = d.note ?? tStatic('policies.noNote');
  if (d.state === 'Draft') return note;
  if (d.state === 'Superseded') return tStatic('policies.meta.superseded', { note, date: formatDate(d.publishedAt) });
  const left = d.acceptanceDeadline ? daysUntil(d.acceptanceDeadline) : 0;
  const window =
    left > 0 ? tStatic('policies.meta.windowCloses', { date: formatDate(d.acceptanceDeadline) }) : tStatic('policies.meta.windowClosed');
  return tStatic('policies.meta.live', { note, date: formatDate(d.publishedAt), window });
}

/** A new Draft version of a document family (`POST /governance/policies`); publishing it is the row's job. */
function DraftForm() {
  const t = useT();
  const draft = useDraftPolicy();
  const [family, setFamily] = useState<PolicyFamily>('tos');
  const [version, setVersion] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ docKey?: string; version?: string; note?: string }>({});
  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!version.trim()) {
      setErrors({ version: t('policies.draft.versionRequired') });
      return;
    }
    setErrors({});
    draft.mutate(
      { docKey: family, version: version.trim(), note: note.trim() || null },
      {
        onSuccess: (d) => {
          setVersion('');
          setNote('');
          toast(t('policies.draft.created', { name: d.name, version: d.version }));
        },
        onError: (err) =>
          setErrors(
            err instanceof ApiError
              ? {
                  docKey: err.field('docKey'),
                  version: err.field('version') ?? (err.isValidation ? undefined : err.message),
                  note: err.field('note'),
                }
              : { version: errorMessage(err) },
          ),
      },
    );
  };
  return (
    <form onSubmit={submit} noValidate className="hstack wrap" style={{ gap: 10, alignItems: 'flex-start', padding: '12px 0 14px' }}>
      <Field label={t('policies.draft.document')} error={errors.docKey} style={{ minWidth: 220 }}>
        {(p) => (
          <select {...p} className="select" value={family} onChange={(e) => setFamily(e.target.value as PolicyFamily)}>
            {POLICY_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {t(`policies.draft.families.${f}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('policies.draft.version')} error={errors.version} style={{ width: 120 }}>
        {(p) => (
          <Input
            {...p}
            value={version}
            maxLength={20}
            placeholder={t('policies.draft.versionPlaceholder')}
            onChange={(e) => setVersion(e.target.value)}
          />
        )}
      </Field>
      <Field label={t('policies.draft.note')} error={errors.note} style={{ flex: '1 1 220px' }}>
        {(p) => <Input {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <button type="submit" className="btn btn--sm" style={{ marginTop: 22 }} disabled={draft.isPending}>
        {draft.isPending && <Spinner />} {t('policies.draft.submit')}
      </button>
    </form>
  );
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
  const [f, setF] = useUrlState({ acceptanceQ: '', acceptancePage: '' });
  const [search, setSearch] = useState(f.acceptanceQ);
  const debounced = useDebounced(search, 300);
  useEffect(() => {
    if (debounced !== f.acceptanceQ) setF({ acceptanceQ: debounced, acceptancePage: '' });
  }, [debounced, f.acceptanceQ, setF]);
  const q = usePolicyAcceptance(doc?.id, { page: Number(f.acceptancePage) || 1, search: f.acceptanceQ || undefined });
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
            onChange={(key) => {
              setF({ acceptancePage: '' });
              onDoc(key);
            }}
          />
        ) : undefined
      }
    >
      {!doc ? (
        <Empty>{t('policies.acceptance.noLive')}</Empty>
      ) : (
        <QueryState query={q} skeleton={<SkeletonRows rows={6} h={26} />} compact>
          {(page) => (
            <>
              <p className="t-sm muted" style={{ margin: '0 0 4px' }}>
                {t('policies.acceptance.summary', {
                  accepted: page.meta.accepted,
                  total: page.meta.accepted + page.meta.pending,
                  name: doc.name,
                  version: doc.version,
                })}
              </p>
              <input
                className="input"
                type="search"
                style={{ width: 240, margin: '6px 0' }}
                placeholder={t('policies.acceptance.searchPlaceholder')}
                aria-label={t('policies.acceptance.searchLabel')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {page.data.length === 0 ? (
                <Empty>{t('policies.acceptance.noMatch')}</Empty>
              ) : (
                <ul
                  className="plain-list"
                  aria-label={t('policies.acceptance.listLabel', { name: doc.name, version: doc.version })}
                  aria-busy={q.isPlaceholderData}
                  style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}
                >
                  {page.data.map((a) => (
                    <AcceptanceRow key={a.tenantId} a={a} doc={doc} />
                  ))}
                </ul>
              )}
              {page.meta.lastPage > 1 && (
                <Pagination meta={page.meta} onPage={(p) => setF({ acceptancePage: String(p) })} noun={t('policies.acceptance.noun')} />
              )}
            </>
          )}
        </QueryState>
      )}
    </Card>
  );
}

export default function PoliciesPage() {
  const t = useT();
  const can = useCan();
  const [f, setF] = useUrlState({ doc: 'tos' });
  // Links that name a document (`?doc=dpa`) open its acceptance, as they did before the page had sections.
  const [params] = useSearchParams();
  const [section, setSection, sectionHref] = useSection(SECTIONS, params.has('doc') ? 'acceptance' : 'documents');
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

      <SectionedPage
        sections={SECTIONS.map((id) => ({ id, label: t(`sections.policies.${id}`) }))}
        active={section}
        onChange={setSection}
        label={t('sections.policies.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'documents'}>
          <Card title={t('policies.documents')} style={{ padding: '14px 18px 4px' }}>
            {can('governance.manage') && <DraftForm />}
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
        </SectionPanel>

        <SectionPanel active={section === 'acceptance'}>
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
        </SectionPanel>
      </SectionedPage>
    </Screen>
  );
}
