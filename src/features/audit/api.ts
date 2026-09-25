import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Paginated } from '@/lib/api/types';
import type { AuditEntry, AuditParams } from './types';

export const auditKeys = {
  all: ['audit'] as const,
  list: (params: AuditParams) => [...auditKeys.all, params] as const,
};

/** Audit entries are written by the server on every significant action — the client only reads them. */
export const AUDIT_LIST_DEFAULTS: AuditParams = { page: 1, perPage: 25 };

export const auditQueries = {
  list: (params: AuditParams) =>
    queryOptions({
      queryKey: auditKeys.list(params),
      queryFn: ({ signal }) => api.get<Paginated<AuditEntry>>('/audit', { query: { ...params }, signal }),
    }),
};

export const useAuditLog = (params: AuditParams) => useQuery({ ...auditQueries.list(params), placeholderData: keepPreviousData });
