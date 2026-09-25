// Mock implementation of /entitlements (what the Laravel EntitlementController will do).
// Plan-level overrides live in the shared `entitlementOverrides` table keyed `${moduleId}:${plan}`
// (server-side storage only — the API always exchanges arrays of cells).
import { entitlementOverrides, liveRoomAllowance } from '@/mocks/collections';
import { extensionPlans, extensionPrice, moduleDefaultForPlan, moduleOnForPlan } from '@/mocks/derive';
import { authorize, handle, http, invalid, ok, readBody, recordAudit, route } from '@/mocks/http';
import { EXTENSIONS, MODULES, PLAN_LIMITS, type ModuleDef } from '@/mocks/reference';
import { LIMIT_KEYS, PLANS, type Plan } from '@/lib/domain';
import type { EntitlementCellInput, EntitlementMatrix, EntitlementModule, PlanLimit } from './types';

const cellKey = (moduleId: string, plan: Plan) => `${moduleId}:${plan}`;

const planDefault = moduleDefaultForPlan;

function toModule(mod: ModuleDef): EntitlementModule {
  const ov = entitlementOverrides.get();
  const ext = EXTENSIONS.find((e) => e.module === mod.id);
  return {
    id: mod.id,
    label: mod.label,
    group: mod.group,
    core: mod.core,
    extension: ext
      ? { key: ext.key, name: ext.name, price: extensionPrice(ext), gatesModule: ext.gatesModule, includedPlans: extensionPlans(ext.key) }
      : null,
    cells: PLANS.map((plan) => ({
      plan,
      enabled: moduleOnForPlan(mod, plan),
      planDefault: planDefault(mod, plan),
      overridden: !mod.core && ov[cellKey(mod.id, plan)] != null,
    })),
  };
}

function matrix(): EntitlementMatrix {
  const modules = MODULES.map(toModule);
  return {
    modules,
    plans: PLANS.map((plan) => ({
      plan,
      enabled: modules.filter((m) => m.cells.find((c) => c.plan === plan)?.enabled).length,
      total: modules.length,
    })),
    overrideCount: Object.keys(entitlementOverrides.get()).length,
  };
}

function limits(): PlanLimit[] {
  const lr = liveRoomAllowance.get();
  return LIMIT_KEYS.map((key) => ({
    key,
    values: PLANS.map((plan) => ({ plan, value: key === 'liveRoomMinutes' ? lr[plan] : PLAN_LIMITS[plan][key] })),
    managedBy: key === 'liveRoomMinutes' ? 'media' : null,
  }));
}

export const handlers = [
  http.get(
    route('/entitlements/limits'),
    handle(() => {
      authorize('platform.view');
      return ok(limits());
    }),
  ),

  http.get(
    route('/entitlements'),
    handle(() => {
      authorize('platform.view');
      return ok(matrix());
    }),
  ),

  // Set one or more module × plan cells. A value equal to the plan default removes the override.
  http.put(
    route('/entitlements'),
    handle(async ({ request }) => {
      authorize('platform.manage');
      const { cells } = await readBody<{ cells: EntitlementCellInput[] }>(request);
      if (!Array.isArray(cells) || cells.length === 0) throw invalid({ cells: 'Send at least one module and plan to change.' });
      const errors: Record<string, string> = {};
      cells.forEach((c, i) => {
        const mod = MODULES.find((m) => m.id === c.moduleId);
        if (!mod) errors[`cells.${i}.moduleId`] = 'Unknown module.';
        else if (mod.core) errors[`cells.${i}.moduleId`] = `${mod.label} is core — every plan keeps it.`;
        if (!PLANS.includes(c.plan)) errors[`cells.${i}.plan`] = 'The selected plan is invalid.';
        if (typeof c.enabled !== 'boolean') errors[`cells.${i}.enabled`] = 'Enabled must be true or false.';
      });
      if (Object.keys(errors).length) throw invalid(errors);

      for (const c of cells) {
        const mod = MODULES.find((m) => m.id === c.moduleId)!;
        const was = moduleOnForPlan(mod, c.plan);
        const next = { ...entitlementOverrides.get() };
        if (c.enabled === planDefault(mod, c.plan)) Reflect.deleteProperty(next, cellKey(mod.id, c.plan));
        else next[cellKey(mod.id, c.plan)] = c.enabled;
        entitlementOverrides.set(next);
        if (was !== c.enabled) recordAudit(`${mod.label} ${c.enabled ? 'added to' : 'removed from'} the ${c.plan} plan`, 'Flags');
      }
      return ok(matrix());
    }),
  ),

  http.delete(
    route('/entitlements/overrides'),
    handle(() => {
      authorize('platform.manage');
      const n = Object.keys(entitlementOverrides.get()).length;
      entitlementOverrides.set({});
      if (n) recordAudit(`Reset ${n} entitlement override${n === 1 ? '' : 's'} to plan defaults`, 'Flags');
      return ok(matrix());
    }),
  ),
];
