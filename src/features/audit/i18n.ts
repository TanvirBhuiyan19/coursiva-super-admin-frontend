import { defineMessages } from '@/lib/i18n';

export const { t, useT } = defineMessages('audit', {
  title: 'Audit log',
  searchPlaceholder: 'Search actor or action…',
  searchLabel: 'Search audit log',
  filterLabel: 'Filter by category',
  all: 'All',
  exporting: 'Exporting…',
  exported: { one: '{count} audit entry exported', other: '{count} audit entries exported' },
  exportFailed: 'Export failed — try again',
  entries: 'Audit entries',
  empty: 'No events match these filters.',
  viewTenant: 'View tenant',
  noun: 'entries',
});
