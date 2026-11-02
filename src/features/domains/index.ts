// Public surface of the domains feature for the shell. The sidebar badge is lazy so the feature stays off the
// critical path.
import { lazy } from 'react';

export const DomainTasksBadge = lazy(() => import('./components/TasksBadge'));
