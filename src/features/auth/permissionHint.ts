// A local hint of the last signed-in user's permissions, used only to start data prefetching on a cold
// load in parallel with the session check (instead of after it). It is never used for authorization:
// the server enforces every permission, and a stale hint at worst causes one silently ignored prefetch.
import type { Permission } from './permissions';
import type { User } from './types';

const KEY = 'sac-permission-hint';

export function rememberPermissions(user: User | null) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user.permissions));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — prefetching just waits for the session */
  }
}

export function permissionHint(): Permission[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as Permission[]) : null;
  } catch {
    return null;
  }
}
