import { moneyFine } from '@/lib/format';
import type { PartnerStatus } from './types';

/** Minor units (cents) → money text. */
export const cents = (minor: number) => moneyFine(minor / 100);

export const statusTone = (s: PartnerStatus) => (s === 'Active' ? 'good' : s === 'Pending' ? 'info' : s === 'Paused' ? 'warn' : 'bad');
