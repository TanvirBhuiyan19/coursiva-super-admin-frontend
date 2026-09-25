import type { AuditCategory } from '@/lib/domain';

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  /** "System" for automated entries. */
  actorName: string;
  action: string;
  category: AuditCategory;
  tenantId: string | null;
  ip: string | null;
}

export interface AuditParams {
  page?: number;
  perPage?: number;
  search?: string;
  category?: AuditCategory;
  tenantId?: string;
}
