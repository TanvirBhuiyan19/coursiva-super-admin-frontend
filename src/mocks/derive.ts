// Server-side business rules used by several mock endpoints (Laravel would put these in
// model accessors / services). Kept in one place so every endpoint reports the same numbers.
import type { Limits, Plan, TenantHealth } from '@/lib/domain';
import { PLAN_RANK, PLANS } from '@/lib/domain';
import {
  apiRateLimits,
  entitlementOverrides,
  extensionInclusions,
  extensionSettings,
  liveRoomAllowance,
  type TenantRow,
} from './collections';
import { EXTENSIONS, MODULES, PLAN_LIMITS, type ExtensionDef, type ModuleDef } from './reference';

const MIN = 60_000;
const DAY = 1440 * MIN;

export const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / MIN));

/** Paying MRR: trials and suspended tenants contribute nothing. */
export const tenantMrr = (t: TenantRow) => (t.status === 'Trial' || t.status === 'Suspended' ? 0 : t.monthlyPrice);

export function tenantHealth(t: TenantRow): { health: TenantHealth; reason: string | null } {
  if (t.status === 'Past due') return { health: 'At risk', reason: 'Payment failing · 2 retries left' };
  if (t.status === 'Suspended') return { health: 'At risk', reason: 'Suspended by staff' };
  if (t.status === 'Trial') {
    const days = t.trialEndsAt ? Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / DAY)) : 0;
    return { health: 'Watch', reason: `Trial converts in ${days} day${days === 1 ? '' : 's'}` };
  }
  if (t.students < 150) return { health: 'Watch', reason: 'Low engagement · no new enrollments in 14 days' };
  return { health: 'Healthy', reason: null };
}

/** Plan defaults: static plan limits plus the operator-owned API rate limit and live-room allowance. */
export function planLimits(plan: Plan): Limits {
  return { ...PLAN_LIMITS[plan], apiPerMinute: apiRateLimits.get()[plan], liveRoomMinutes: liveRoomAllowance.get()[plan] };
}

/** Limits a tenant actually gets: plan defaults with its per-tenant overrides applied (0 = unlimited). */
export function effectiveLimits(t: TenantRow): Limits {
  return { ...planLimits(t.plan), ...t.limitOverrides };
}

/** Students used vs the effective student limit (0 = unlimited → reported against a nominal 100k). */
export function utilization(t: TenantRow) {
  const cap = effectiveLimits(t).students || 100_000;
  return Math.min(100, Math.round((t.students / cap) * 100));
}

export function lifecycleStage(t: TenantRow) {
  if (t.status === 'Trial') return 'Trial';
  if (t.status === 'Past due') return 'Dunning · retry 2 of 4';
  if (t.status === 'Suspended') return 'Suspended';
  return minutesSince(t.lastActiveAt) > 3 * 1440 ? 'Dormant' : 'Active';
}

export const isDormant = (t: TenantRow) => t.status === 'Active' && minutesSince(t.lastActiveAt) > 3 * 1440;

// ---------- Extensions & entitlements ----------
export function extensionPlans(key: string): Plan[] {
  const custom = extensionInclusions.get()[key];
  if (custom) return custom;
  const def = EXTENSIONS.find((e) => e.key === key);
  const from = def?.freeFrom;
  return from ? PLANS.filter((p) => PLAN_RANK[p] >= PLAN_RANK[from]) : [];
}

/** Current price of an extension (catalogue price unless staff changed it). */
export const extensionPrice = (e: ExtensionDef) => extensionSettings.get().prices[e.key] ?? e.price;

/** A module's access for a plan before plan-level overrides: core → on; a gating extension decides; else the tier. */
export function moduleDefaultForPlan(mod: ModuleDef, plan: Plan): boolean {
  if (mod.core) return true;
  const ext = EXTENSIONS.find((e) => e.module === mod.id);
  if (ext?.gatesModule) return extensionPlans(ext.key).includes(plan);
  return PLAN_RANK[plan] >= mod.tier;
}

/** Whether a module is on for a plan: an explicit plan-level override wins over the default. */
export function moduleOnForPlan(mod: ModuleDef, plan: Plan): boolean {
  if (mod.core) return true;
  return entitlementOverrides.get()[`${mod.id}:${plan}`] ?? moduleDefaultForPlan(mod, plan);
}

export interface HealthScore {
  score: number;
  churnRisk: 'Low' | 'Medium' | 'High';
  drivers: { label: string; value: string; trend: 'up' | 'down' }[];
}

/** Tenant health score (0–100) and the signals behind it. Shared by the tenant drawer and Growth analytics. */
export function tenantHealthScore(t: TenantRow): HealthScore {
  const seed = t.name.length;
  const drivers: HealthScore['drivers'] = [
    { label: 'Student logins · 30d', value: seed % 3 === 0 ? '−18%' : '+12%', trend: seed % 3 === 0 ? 'down' : 'up' },
    { label: 'Course publishing', value: seed % 4 === 0 ? 'Stalled 3 weeks' : 'Active', trend: seed % 4 === 0 ? 'down' : 'up' },
    { label: 'Payment health', value: t.status === 'Past due' ? 'Failing card' : 'Clean', trend: t.status === 'Past due' ? 'down' : 'up' },
    { label: 'Support tickets', value: seed % 5 === 0 ? '3 open · 1 escalated' : 'None open', trend: seed % 5 === 0 ? 'down' : 'up' },
  ];
  const downs = drivers.filter((d) => d.trend === 'down').length;
  const score = t.status === 'Suspended' ? 18 : Math.max(12, 92 - downs * 22 - (t.status === 'Trial' ? 8 : 0));
  return { score, churnRisk: score >= 70 ? 'Low' : score >= 45 ? 'Medium' : 'High', drivers };
}

export const tenantModules = (t: TenantRow) =>
  MODULES.filter((m) => !m.core).map((m) => {
    const planDefault = moduleOnForPlan(m, t.plan);
    const override = t.entitlementOverrides[m.id];
    return {
      id: m.id,
      label: m.label,
      group: m.group,
      planDefault,
      enabled: override ?? planDefault,
      overridden: override != null && override !== planDefault,
    };
  });
