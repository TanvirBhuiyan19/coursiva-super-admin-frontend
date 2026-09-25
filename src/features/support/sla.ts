// Display rules for the server-computed SLA fields (the server decides the state; the client only words it).
import type { Tone } from '@/lib/domain';
import { shortDuration, toneFg } from '@/lib/format';
import type { Ticket, TicketPriority, TicketStatus } from './types';

const minutesUntil = (iso: string, now: number) => (new Date(iso).getTime() - now) / 60_000;

export function slaLabel(t: Pick<Ticket, 'slaState' | 'slaDueAt'>, now = Date.now()): string {
  const left = t.slaDueAt ? minutesUntil(t.slaDueAt, now) : 0;
  switch (t.slaState) {
    case 'on_track':
    case 'at_risk':
      return `First reply due in ${shortDuration(left)}`;
    case 'breached':
      return `First reply ${shortDuration(left)} late`;
    case 'responded':
      return `Responded · resolve in ${shortDuration(left)}`;
    case 'overdue':
      return 'Responded · resolution overdue';
    case 'paused':
      return 'Waiting on tenant · SLA paused';
    case 'resolved':
      return 'Resolved';
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
