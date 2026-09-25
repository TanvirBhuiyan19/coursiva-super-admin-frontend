// API resources for /entitlements. These types are the contract the Laravel EntitlementResource must match.
import type { LimitKey, Plan } from '@/lib/domain';

/** One module × plan cell of the matrix. */
export interface EntitlementCell {
  plan: Plan;
  enabled: boolean;
  /** What the plan gives without an override (tier, or the gating extension's plan inclusion). */
  planDefault: boolean;
  overridden: boolean;
}

export interface EntitlementModule {
  id: string;
  label: string;
  group: string;
  /** Core modules are on for every plan and can't be changed. */
  core: boolean;
  /** Extension sold for this module, if any. */
  extension: {
    key: string;
    name: string;
    price: number;
    /** True: the extension's plan inclusion decides access. False: an upsell inside the module. */
    gatesModule: boolean;
    includedPlans: Plan[];
  } | null;
  /** One cell per plan, in plan order. */
  cells: EntitlementCell[];
}

export interface EntitlementMatrix {
  modules: EntitlementModule[];
  plans: { plan: Plan; enabled: number; total: number }[];
  overrideCount: number;
}

export interface EntitlementCellInput {
  moduleId: string;
  plan: Plan;
  enabled: boolean;
}

/** Plan limit row. `value` 0 = unlimited. */
export interface PlanLimit {
  key: LimitKey;
  values: { plan: Plan; value: number }[];
  /** Screen that owns the value when it isn't edited here (live-room minutes → Video & storage). */
  managedBy: 'media' | null;
}
