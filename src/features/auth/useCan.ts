import { useSession } from './api';
import type { Permission } from './permissions';

/** `const can = useCan(); can('tenants.suspend')` — UI-only gate; the API enforces the same rule. */
export function useCan() {
  const { data: user } = useSession();
  return (permission: Permission | undefined) => !permission || !!user?.permissions.includes(permission);
}
