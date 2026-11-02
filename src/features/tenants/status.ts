// Tenant status rules the console reads from the API (billing.md → Card-first trials).
import type { Tenant } from './types';

/** `suspension_reason` of a school whose card-less trial ended: paused until a card is added. */
export const PAUSED_FOR_CARD = 'payment_method_required';

export const isPausedForCard = (tn: Pick<Tenant, 'status' | 'suspensionReason'>) =>
  tn.status === 'Suspended' && tn.suspensionReason === PAUSED_FOR_CARD;

/** `POST /tenants/{id}/extend-trial` → `days`: 1–90, default 14. */
export const EXTEND_TRIAL = { min: 1, max: 90, default: 14 } as const;

/** Staff can extend a running trial, or give a paused school a new one. */
export const canExtendTrial = (tn: Pick<Tenant, 'status' | 'suspensionReason'>) => tn.status === 'Trial' || isPausedForCard(tn);
