// Public surface of the tenants feature for other features and the shell.
// Heavy UI is exported lazily so importing it never pulls forms (zod, react-hook-form) onto the critical path.
import { lazyWithPreload } from '@/lib/lazy';

export { useTenant, useTenants, useTenantSummary, useUpdateTenant, useImpersonate, invalidateTenantData, tenantKeys } from './api';
export type { Tenant, TenantDetail, TenantSummary } from './types';

export const ProvisionTenantModal = lazyWithPreload(() =>
  import('./components/ProvisionTenantModal').then((m) => ({ default: m.ProvisionTenantModal })),
);
export const ImpersonationView = lazyWithPreload(() =>
  import('./components/ImpersonationView').then((m) => ({ default: m.ImpersonationView })),
);
