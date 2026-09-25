import type { Plan, TenantHealth } from '@/lib/domain';

export const OVERVIEW_RANGES = ['30d', '90d', '12mo'] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

/** GET /overview — platform headline numbers. Labels and colour bands are applied client-side. */
export interface Overview {
  range: OverviewRange;
  mrr: { value: number; deltaPct: number };
  tenants: { value: number; delta: number };
  students: { value: number; delta: number };
  revenueChurn: { valuePct: number; deltaPts: number };
  /** Last 12 months, oldest first. `month` is the first day of the month (ISO date). */
  mrrSeries: { month: string; mrr: number }[];
  planDistribution: { plan: Plan; tenants: number; mrr: number }[];
  queue: {
    dunning: { count: number; amount: number };
    tickets: { high: number; open: number };
    trials: { count: number; names: string[] };
    overages: { count: number; amount: number };
    privacy: { dueSoon: number; overdue: number; soonestDays: number | null };
  };
  mrrAtRisk: { amount: number; tenants: number };
  entitlementOverrides: number;
  watchlist: { tenantId: string; name: string; health: TenantHealth; reason: string }[];
}
