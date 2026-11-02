// Display rules for domain resale (pure; no components here).
import type { Tone } from '@/lib/domain';
import type { DomainOrderStatus, RegistrarTaskStatus, RegistrationStatus } from './types';

export const REGISTRATION_TONE: Record<RegistrationStatus, Tone> = {
  registering: 'info',
  active: 'good',
  expiring: 'warn',
  grace: 'bad',
  expired: 'bad',
  transfer_requested: 'info',
  transferred_out: 'flat',
  failed: 'bad',
};

export const ORDER_TONE: Record<DomainOrderStatus, Tone> = {
  quoted: 'flat',
  charging: 'info',
  paid: 'info',
  registering: 'info',
  completed: 'good',
  failed: 'bad',
  refunded: 'warn',
  credited: 'warn',
};

export const TASK_TONE: Record<RegistrarTaskStatus, Tone> = { open: 'warn', done: 'good', cancelled: 'flat' };

/** Exact USD to the cent (domain prices are small, e.g. $13.99, and margins matter). */
export const usd = (n: number) => `$${n.toFixed(2)}`;

/** True while an ISO time is still ahead (e.g. a transfer lock). */
export const isFuture = (iso: string | null) => !!iso && new Date(iso).getTime() > Date.now();
