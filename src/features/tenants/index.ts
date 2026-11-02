// Public surface of the tenants feature for other features and the shell.
// Heavy UI is exported lazily so importing it never pulls forms (zod, react-hook-form) onto the critical path.
import { lazyWithPreload } from '@/lib/lazy';

// Hooks and types are imported from '@/features/tenants/api' and '/types' directly: re-exporting them here would put the
// tenants API module on the critical path (the shell imports this file for the lazy modal).
export type { Tenant, TenantDetail, TenantSummary } from './types';

export const ProvisionTenantModal = lazyWithPreload(() =>
  import('./components/ProvisionTenantModal').then((m) => ({ default: m.ProvisionTenantModal })),
);
export const ImpersonateAction = lazyWithPreload(() =>
  import('./components/ImpersonateAction').then((m) => ({ default: m.ImpersonateAction })),
);
