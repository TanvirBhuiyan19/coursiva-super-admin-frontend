import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { invalidateTenantData } from '@/features/tenants/api';
import { api } from '@/lib/api/client';
import type { Resource } from '@/lib/api/types';
import type { EntitlementCellInput, EntitlementMatrix, PlanLimit } from './types';

export const entitlementKeys = {
  all: ['entitlements'] as const,
  matrix: () => [...entitlementKeys.all, 'matrix'] as const,
  limits: () => [...entitlementKeys.all, 'limits'] as const,
};

/** Plan access feeds every tenant's module list and the overview's override count. */
function invalidateAccess(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: entitlementKeys.matrix() });
  invalidateTenantData(qc); // also invalidates ['overview'] and ['audit']
}

export const useEntitlements = () =>
  useQuery({
    queryKey: entitlementKeys.matrix(),
    queryFn: ({ signal }) => api.get<Resource<EntitlementMatrix>>('/entitlements', { signal }).then((r) => r.data),
  });

export const usePlanLimits = () =>
  useQuery({
    queryKey: entitlementKeys.limits(),
    queryFn: ({ signal }) => api.get<Resource<PlanLimit[]>>('/entitlements/limits', { signal }).then((r) => r.data),
  });

function applyCells(m: EntitlementMatrix, cells: EntitlementCellInput[]): EntitlementMatrix {
  const modules = m.modules.map((mod) => ({
    ...mod,
    cells: mod.cells.map((c) => {
      const next = cells.find((x) => x.moduleId === mod.id && x.plan === c.plan);
      return next ? { ...c, enabled: next.enabled, overridden: next.enabled !== c.planDefault } : c;
    }),
  }));
  return { ...m, modules };
}

export function useSetEntitlements() {
  const qc = useQueryClient();
  const key = entitlementKeys.matrix();
  return useMutation({
    mutationFn: (cells: EntitlementCellInput[]) => api.put<Resource<EntitlementMatrix>>('/entitlements', { cells }).then((r) => r.data),
    onMutate: async (cells) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<EntitlementMatrix>(key);
      if (prev) qc.setQueryData(key, applyCells(prev, cells));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (m) => qc.setQueryData(key, m),
    onSettled: () => invalidateAccess(qc),
  });
}

export function useResetEntitlements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<Resource<EntitlementMatrix>>('/entitlements/overrides').then((r) => r.data),
    onSuccess: (m) => {
      qc.setQueryData(entitlementKeys.matrix(), m);
      invalidateAccess(qc);
    },
  });
}
