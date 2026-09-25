// Mock implementation of /support (what the Laravel TicketController + policies will do).
import { http } from 'msw';
import { invoices, staff, tenants, tickets, type TicketMessage as MessageRow, type TicketRow } from '@/mocks/collections';
import { ago, collection, id } from '@/mocks/db';
import { lifecycleStage, tenantHealth, tenantMrr } from '@/mocks/derive';
import { authorize, handle, invalid, notFound, ok, paginate, query, readBody, recordAudit, route } from '@/mocks/http';
import { formatDate } from '@/lib/format';
import type { Tone } from '@/lib/domain';
import {
  TICKET_STATUSES,
  TICKET_VIEWS,
  type NewTicketMessage,
  type SlaState,
  type SupportOptions,
  type SupportSummary,
  type TenantContext,
  type Ticket,
  type TicketDetail,
  type TicketUpdate,
  type TicketView,
} from './types';

const MIN = 60_000;
/** First-reply target per priority (minutes). */
export const SLA_FIRST_REPLY: Record<TicketRow['priority'], number> = { High: 60, Medium: 240, Low: 480 };
/** Resolution target from creation (minutes). */
export const SLA_RESOLVE = 1440;
const AT_RISK_MINUTES = 60;
const MAX_MESSAGE = 5000;

export const TAGS = ['Billing', 'Bug', 'How-to', 'Feature request', 'Outage', 'Churn risk'];

const CANNED_REPLIES: SupportOptions['cannedReplies'] = [
  {
    id: 'billing',
    title: 'Billing issue',
    body: "Thanks for flagging — I checked Stripe on our side and retried the charge. Could you confirm your bank isn't blocking the 3DS prompt?",
  },
  {
    id: 'sso',
    title: 'SSO upsell',
    body: 'SSO (Google Workspace + SAML) is included on the Scale plan. I can enable a 14-day Scale trial so you can test it — want me to?',
  },
  {
    id: 'escalate',
    title: 'Escalate',
    body: "I've escalated this to engineering with your account attached. You'll have an update here within 4 business hours.",
  },
];

// ---------- Feature-only table: tickets closed before the current inbox (history + CSAT) ----------
interface ArchivedTicketRow {
  id: string;
  tenantId: string;
  number: number;
  subject: string;
  createdAt: string;
  csat: number | null;
}
const archive = collection<ArchivedTicketRow>('supportArchive', () => {
  const rows: [string, number, string, number, number | null][] = [
    ['tn_bloom', 988, 'Renewal invoice failed', 44, 4.8],
    ['tn_bloom', 942, 'Bulk student import stuck', 57, 5],
    ['tn_devpath', 1002, 'Custom domain SSL', 84, 4],
    ['tn_devpath', 951, 'API rate limit raised for launch week', 110, 5],
    ['tn_kodo', 976, 'Certificate template alignment', 40, 4.5],
    ['tn_nordic', 931, 'Migrating from Teachable', 120, 5],
    ['tn_amplify', 990, 'Refund a student purchase', 30, 4],
    ['tn_peak', 960, 'Video processing slow', 70, 3],
  ];
  return rows.map(([tenantId, number, subject, d, csat]) => ({
    id: `ar_${number}`,
    tenantId,
    number,
    subject,
    createdAt: ago({ d }),
    csat,
  }));
});

// ---------- Derived fields (server-side SLA rules) ----------
const publicStaffReplies = (t: TicketRow) => t.messages.filter((m) => m.author === 'staff' && !m.internal);
const firstReplyAt = (t: TicketRow) => publicStaffReplies(t)[0]?.createdAt ?? null;
const plusMinutes = (iso: string, m: number) => new Date(new Date(iso).getTime() + m * MIN).toISOString();

function sla(t: TicketRow): { state: SlaState; dueAt: string | null } {
  if (t.status === 'Resolved') return { state: 'resolved', dueAt: null };
  if (t.status === 'Pending') return { state: 'paused', dueAt: null };
  const now = Date.now();
  if (firstReplyAt(t)) {
    const dueAt = plusMinutes(t.createdAt, SLA_RESOLVE);
    return { state: new Date(dueAt).getTime() <= now ? 'overdue' : 'responded', dueAt };
  }
  const dueAt = plusMinutes(t.createdAt, SLA_FIRST_REPLY[t.priority]);
  const left = (new Date(dueAt).getTime() - now) / MIN;
  return { state: left < 0 ? 'breached' : left < AT_RISK_MINUTES ? 'at_risk' : 'on_track', dueAt };
}

const isUnanswered = (t: TicketRow) => t.status !== 'Resolved' && !firstReplyAt(t);

const VIEWS: Record<TicketView, (t: TicketRow) => boolean> = {
  open: (t) => t.status !== 'Resolved',
  breaching: (t) => sla(t).state === 'breached',
  unanswered: isUnanswered,
  pending: (t) => t.status === 'Pending',
  resolved: (t) => t.status === 'Resolved',
  all: () => true,
};

function toTicket(t: TicketRow): Ticket {
  const tenant = tenants.find(t.tenantId);
  const assignee = t.assigneeId ? staff.find(t.assigneeId) : undefined;
  const { state, dueAt } = sla(t);
  const last = t.messages.reduce((max, m) => (m.createdAt > max ? m.createdAt : max), t.createdAt);
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    channel: t.channel,
    requesterName: t.requesterName,
    tenant: { id: t.tenantId, name: tenant?.name ?? 'Unknown tenant', plan: tenant?.plan ?? 'Launch' },
    assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
    tags: t.tags,
    escalated: t.escalated,
    createdAt: t.createdAt,
    updatedAt: last,
    firstReplyAt: firstReplyAt(t),
    slaState: state,
    slaDueAt: dueAt,
    slaTargetMinutes: SLA_FIRST_REPLY[t.priority],
  };
}

function tenantContext(t: TicketRow): TenantContext {
  const tn = tenants.find(t.tenantId);
  if (!tn) throw notFound('Tenant');
  const { health, reason } = tenantHealth(tn);
  const lastInvoice = invoices.where((v) => v.tenantId === tn.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  const open = tickets.where((x) => x.tenantId === tn.id && x.status !== 'Resolved').length;
  const escalated = tickets.where((x) => x.tenantId === tn.id && x.escalated && x.status !== 'Resolved').length;
  const healthTone: Tone = health === 'Healthy' ? 'good' : health === 'Watch' ? 'warn' : 'bad';
  const signals: TenantContext['signals'] = [
    { label: 'Health', value: reason ? `${health} · ${reason}` : health, tone: healthTone },
    { label: 'Lifecycle', value: lifecycleStage(tn), tone: tn.status === 'Active' ? 'flat' : 'warn' },
    lastInvoice
      ? {
          label: 'Last invoice',
          value: `${lastInvoice.status} · ${formatDate(lastInvoice.issuedAt)}`,
          tone: lastInvoice.status === 'Past due' ? 'bad' : 'flat',
        }
      : { label: 'Last invoice', value: tn.status === 'Trial' ? 'On trial' : 'None yet', tone: 'flat' },
    {
      label: 'Open tickets',
      value: escalated ? `${open} · ${escalated} escalated` : String(open),
      tone: escalated ? 'bad' : open > 1 ? 'warn' : 'flat',
    },
  ];
  const past: TenantContext['pastTickets'] = [
    ...tickets
      .where((x) => x.tenantId === tn.id && x.id !== t.id)
      .map((x) => ({ id: x.id, number: x.number, subject: x.subject, status: x.status, createdAt: x.createdAt, csat: null })),
    ...archive
      .where((a) => a.tenantId === tn.id)
      .map((a) => ({ id: null, number: a.number, subject: a.subject, status: 'Resolved' as const, createdAt: a.createdAt, csat: a.csat })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    id: tn.id,
    name: tn.name,
    plan: tn.plan,
    status: tn.status,
    ownerName: tn.ownerName,
    mrr: tenantMrr(tn),
    health,
    healthReason: reason,
    signals,
    pastTickets: past.slice(0, 5),
  };
}

const toDetail = (t: TicketRow): TicketDetail => ({
  ...toTicket(t),
  messages: [...t.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  tenantContext: tenantContext(t),
});

function findTicket(ticketId: string | readonly string[] | undefined) {
  const t = typeof ticketId === 'string' ? tickets.find(ticketId) : undefined;
  if (!t) throw notFound('Ticket');
  return t;
}

const activeStaff = () => staff.where((s) => s.status === 'Active');
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

type Params = { id: string };

export const handlers = [
  http.get(
    route('/support/summary'),
    handle(() => {
      authorize('support.view');
      const all = tickets.all();
      const breaching = all.filter(VIEWS.breaching).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const replyMinutes = all
        .map((t) => {
          const at = firstReplyAt(t);
          return at ? (new Date(at).getTime() - new Date(t.createdAt).getTime()) / MIN : null;
        })
        .filter((m): m is number => m != null);
      const ratings = archive
        .all()
        .filter((a) => a.csat != null && Date.now() - new Date(a.createdAt).getTime() <= 180 * 1440 * MIN)
        .map((a) => a.csat!);
      const summary: SupportSummary = {
        open: all.filter(VIEWS.open).length,
        unanswered: all.filter(VIEWS.unanswered).length,
        breaching: breaching.length,
        oldestBreachAt: breaching[0]?.createdAt ?? null,
        medianFirstReplyMinutes: median(replyMinutes.map(Math.round)),
        csat: ratings.length
          ? { score: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10, responses: ratings.length }
          : null,
        views: TICKET_VIEWS.map((view) => ({ view, count: all.filter(VIEWS[view]).length })),
      };
      return ok(summary);
    }),
  ),

  http.get(
    route('/support/options'),
    handle(() => {
      authorize('support.view');
      const options: SupportOptions = {
        assignees: activeStaff().map((s) => ({ id: s.id, name: s.name })),
        tags: TAGS,
        cannedReplies: CANNED_REPLIES,
      };
      return ok(options);
    }),
  ),

  http.get(
    route('/support/tickets'),
    handle(({ request }) => {
      authorize('support.view');
      const q = query(request);
      const view = (q.get('view') ?? 'open') as TicketView;
      let rows = tickets.all().filter(VIEWS[view] ?? VIEWS.open);
      if (q.search) {
        rows = rows.filter((t) =>
          [t.subject, t.requesterName, tenants.find(t.tenantId)?.name ?? '', `#${t.number}`, String(t.number)].some((s) =>
            s.toLowerCase().includes(q.search),
          ),
        );
      }
      // Newest first; tickets breaching SLA float to the top.
      const rank = (t: TicketRow) => (sla(t).state === 'breached' ? 0 : 1);
      rows = [...rows].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
      return paginate(rows.map(toTicket), request);
    }),
  ),

  http.get<Params>(
    route('/support/tickets/:id'),
    handle<Params>(({ params }) => {
      authorize('support.view');
      return ok(toDetail(findTicket(params.id)));
    }),
  ),

  http.post<Params>(
    route('/support/tickets/:id/messages'),
    handle<Params>(async ({ request, params }) => {
      const user = authorize('support.manage');
      const t = findTicket(params.id);
      const body = await readBody<Partial<NewTicketMessage>>(request);
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      const internal = body.internal === true;
      if (!text) throw invalid({ body: internal ? 'Write the note first.' : 'Write a reply first.' });
      if (text.length > MAX_MESSAGE) throw invalid({ body: `Keep it under ${MAX_MESSAGE.toLocaleString('en-US')} characters.` });
      const msg: MessageRow = {
        id: id('msg'),
        author: 'staff',
        authorName: user.name,
        body: text,
        createdAt: new Date().toISOString(),
        internal,
      };
      tickets.update(t.id, { messages: [...t.messages, msg] });
      const tenantName = tenants.find(t.tenantId)?.name ?? 'Unknown tenant';
      recordAudit(
        internal ? `Added an internal note to ticket #${t.number} (${tenantName})` : `Replied to ticket #${t.number} (${tenantName})`,
        'Tenants',
        t.tenantId,
      );
      return ok(toDetail(t), 201);
    }),
  ),

  http.patch<Params>(
    route('/support/tickets/:id'),
    handle<Params>(async ({ request, params }) => {
      authorize('support.manage');
      const t = findTicket(params.id);
      const body = await readBody<TicketUpdate>(request);
      const errors: Record<string, string> = {};
      if (body.assigneeId !== undefined && body.assigneeId !== null && !activeStaff().some((s) => s.id === body.assigneeId))
        errors.assigneeId = 'Pick an active staff member.';
      if (body.status !== undefined && !TICKET_STATUSES.includes(body.status)) errors.status = 'The selected status is invalid.';
      if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => !TAGS.includes(tag))))
        errors.tags = 'Use tags from the list.';
      if (Object.keys(errors).length) throw invalid(errors);

      if (body.assigneeId !== undefined && body.assigneeId !== t.assigneeId) {
        const who = body.assigneeId ? staff.find(body.assigneeId)?.name : null;
        tickets.update(t.id, { assigneeId: body.assigneeId });
        recordAudit(who ? `Assigned ticket #${t.number} to ${who}` : `Unassigned ticket #${t.number}`, 'Tenants', t.tenantId);
      }
      if (body.status !== undefined && body.status !== t.status) {
        recordAudit(`Changed ticket #${t.number} from ${t.status} to ${body.status}`, 'Tenants', t.tenantId);
        tickets.update(t.id, { status: body.status });
      }
      if (body.tags !== undefined) tickets.update(t.id, { tags: [...new Set(body.tags)] });
      return ok(toDetail(t));
    }),
  ),

  http.post<Params>(
    route('/support/tickets/:id/escalate'),
    handle<Params>(({ params }) => {
      authorize('support.manage');
      const t = findTicket(params.id);
      if (t.escalated) throw invalid({ escalated: `Ticket #${t.number} is already escalated.` });
      tickets.update(t.id, { escalated: true, ...(t.status === 'Resolved' ? { status: 'Open' as const } : {}) });
      recordAudit(`Escalated ticket #${t.number} to engineering`, 'Tenants', t.tenantId);
      return ok(toDetail(t));
    }),
  ),

  http.post<Params>(
    route('/support/tickets/:id/resolve'),
    handle<Params>(({ params }) => {
      authorize('support.manage');
      const t = findTicket(params.id);
      if (t.status === 'Resolved') throw invalid({ status: `Ticket #${t.number} is already resolved.` });
      recordAudit(`Resolved ticket #${t.number} and sent a CSAT survey to ${t.requesterName}`, 'Tenants', t.tenantId);
      tickets.update(t.id, { status: 'Resolved' });
      return ok(toDetail(t));
    }),
  ),
];
