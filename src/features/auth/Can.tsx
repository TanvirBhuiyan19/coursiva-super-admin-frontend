import type { ReactNode } from 'react';
import type { Permission } from './permissions';
import { useCan } from './useCan';

/** Renders children only when the signed-in user has the permission (or `fallback` otherwise). */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const can = useCan();
  return <>{can(permission) ? children : fallback}</>;
}
