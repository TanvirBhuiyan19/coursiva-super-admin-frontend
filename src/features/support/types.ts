// API resources for /support. These types are the contract the Laravel TicketResource must match.
import type { Plan, TenantHealth, TenantStatus, Tone } from '@/lib/domain';

export const TICKET_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['Open', 'Pending', 'Resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketChannel = 'Email' | 'In-app chat';

export const TICKET_VIEWS = ['open', 'breaching', 'unanswered', 'pending', 'resolved', 'all'] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

export const VIEW_LABELS: Record<TicketView, string> = {
  open: 'All open',
  breaching: 'Breaching SLA',
  unanswered: 'Unanswered',
  pending: 'Pending',
  resolved: 'Resolved',
  all: 'Everything',
};

/**
 * SLA position, computed server-side from `created_at`, the first staff reply and the priority target
 * (first reply: High 60 min · Medium 240 min · Low 480 min; resolution: 24 h).
 * - `on_track` / `at_risk` (< 60 min left) / `breached` — awaiting the first reply; `sla_due_at` is the first-reply deadline.
 * - `responded` / `overdue` — replied; `sla_due_at` is the resolution deadline.
 * - `paused` — Pending (waiting on the tenant); the clock is stopped.
 * - `resolved` — closed.
 */
export type SlaState = 'on_track' | 'at_risk' | 'breached' | 'responded' | 'overdue' | 'paused' | 'resolved';

export interface TicketListParams {
  page?: number;
  perPage?: number;
  view?: TicketView;
  search?: string;
}

export interface StaffRef {
  id: string;
  name: string;
}

/** Row in the support inbox. */
export interface Ticket {
  id: string;
  number: number;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  channel: TicketChannel;
  requesterName: string;
  tenant: { id: string; name: string; plan: Plan };
  assignee: StaffRef | null;
  tags: string[];
  escalated: boolean;
  createdAt: string;
  /** Time of the latest message (public or internal). */
  updatedAt: string;
  /** First public staff reply, null while unanswered. */
  firstReplyAt: string | null;
  slaState: SlaState;
  /** First-reply deadline while unanswered, resolution deadline once replied; null when paused/resolved. */
  slaDueAt: string | null;
  /** First-reply target for this priority, minutes. */
  slaTargetMinutes: number;
}

export interface TicketMessage {
  id: string;
  author: 'tenant' | 'staff';
  authorName: string;
  body: string;
  createdAt: string;
  /** Internal notes are staff-only and never shown to the tenant. */
  internal: boolean;
}

export interface TenantContext {
  id: string;
  name: string;
  plan: Plan;
  status: TenantStatus;
  ownerName: string;
  /** Paying MRR (same rule as the tenant directory). */
  mrr: number;
  health: TenantHealth;
  healthReason: string | null;
  signals: { label: string; value: string; tone: Tone }[];
  pastTickets: { id: string | null; number: number; subject: string; status: TicketStatus; createdAt: string; csat: number | null }[];
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
  tenantContext: TenantContext;
}

export interface SupportSummary {
  open: number;
  unanswered: number;
  breaching: number;
  /** Creation time of the oldest ticket breaching its first-reply SLA. */
  oldestBreachAt: string | null;
  /** Median minutes to first reply across replied tickets. */
  medianFirstReplyMinutes: number | null;
  csat: { score: number; responses: number } | null;
  /** Count per inbox view. */
  views: { view: TicketView; count: number }[];
}

export interface SupportOptions {
  /** Active staff who can be assigned tickets. */
  assignees: StaffRef[];
  tags: string[];
  cannedReplies: { id: string; title: string; body: string }[];
}

export type TicketUpdate = Partial<{ assigneeId: string | null; status: TicketStatus; tags: string[] }>;

export interface NewTicketMessage {
  body: string;
  internal: boolean;
}
