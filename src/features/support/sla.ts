// Display rules for the server-computed SLA fields (the server decides the state; the client only words it).
import type { Tone } from '@/lib/domain';
import { shortDuration, toneFg } from '@/lib/format';
import { t } from './i18n';
import type { Ticket, TicketPriority, TicketStatus } from './types';

const minutesUntil = (iso: string, now: number) => (new Date(iso).getTime() - now) / 60_000;

export function slaLabel(tk: Pick<Ticket, 'slaState' | 'slaDueAt'>, now = Date.now()): string {
  const left = tk.slaDueAt ? minutesUntil(tk.slaDueAt, now) : 0;
  switch (tk.slaState) {
    case 'on_track':
    case 'at_risk':
      return t('sla.dueIn', { duration: shortDuration(left) });
    case 'breached':
      return t('sla.late', { duration: shortDuration(left) });
    case 'responded':
      return t('sla.responded', { duration: shortDuration(left) });
    case 'overdue':
      return t('sla.overdue');
    case 'paused':
      return t('sla.paused');
    case 'resolved':
      return t('sla.resolved');
  }
}

export function slaTone(state: Ticket['slaState']): Tone {
  if (state === 'resolved') return 'good';
  if (state === 'breached') return 'bad';
  if (state === 'at_risk' || state === 'overdue') return 'warn';
  return 'flat';
}

/** Text colour for an SLA tone (`flat` reads as muted text rather than the badge grey). */
export const slaFg = (tone: Tone) => (tone === 'flat' ? 'var(--tx3)' : toneFg(tone));

export const priorityTone = (p: TicketPriority): Tone => (p === 'High' ? 'bad' : p === 'Medium' ? 'warn' : 'flat');
export const statusTone = (s: TicketStatus): Tone => (s === 'Open' ? 'bad' : s === 'Pending' ? 'warn' : 'good');
