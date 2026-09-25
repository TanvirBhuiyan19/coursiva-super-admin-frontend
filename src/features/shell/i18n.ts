// Console shell text: header, sidebar, command palette, toasts and the route error boundary.
import { defineMessages } from '@/lib/i18n';

export const { t, useT } = defineMessages('shell', {
  brand: 'Coursiva',
  documentTitle: '{screen} · Coursiva console',
  documentTitleFallback: 'Coursiva console',
  skipToContent: 'Skip to content',
  sidebar: {
    label: 'Console navigation',
    homeLabel: 'Coursiva platform console — home',
    tagline: 'Platform console',
    openTickets: { one: '{count} open ticket', other: '{count} open tickets' },
    platformOwner: 'Platform owner',
  },
  header: {
    openNavigation: 'Open navigation',
    searchLabel: 'Search (Ctrl+K)',
    searchTitle: 'Search tenants, invoices, tickets and settings',
    searchPlaceholder: 'Search tenants, invoices, tickets…',
    lightMode: 'Switch to light mode',
    darkMode: 'Switch to dark mode',
    operational: 'All systems operational',
    degraded: 'Degraded performance',
    newTenant: 'New tenant',
    accountMenu: 'Account menu',
  },
  notifications: {
    title: 'Notifications',
    unreadLabel: 'Notifications, {count} unread',
    markAllRead: 'Mark all read',
    empty: 'You’re all caught up.',
  },
  toasts: {
    label: 'Notifications',
  },
  palette: {
    label: 'Command palette',
    placeholder: 'Search tenants, invoices, tickets — or type > for actions',
    searchLabel: 'Search the console',
    searching: 'Searching…',
    resultCount: { one: '{count} result', other: '{count} results' },
    results: 'Results',
    noMatches: 'No matches',
    /** Group headings and scope chips. */
    groups: {
      Recent: 'Recent',
      Action: 'Actions',
      Screen: 'Screens',
      Tenant: 'Tenants',
      Invoice: 'Invoices',
      Ticket: 'Tickets',
      Staff: 'Staff',
    },
    /** Kind label on the right of each row. */
    kinds: {
      Recent: 'Recent',
      Action: 'Action',
      Screen: 'Screen',
      Tenant: 'Tenant',
      Invoice: 'Invoice',
      Ticket: 'Ticket',
      Staff: 'Staff',
    },
    actions: {
      newTenant: 'Create new tenant',
      announce: 'Broadcast announcement',
      incident: 'Post or resolve an incident',
      theme: 'Toggle light / dark mode',
    },
    hints: {
      navigate: 'navigate',
      open: 'open',
      close: 'close',
      toggle: 'toggle',
    },
  },
  errorBoundary: {
    title: 'This screen hit a problem',
    body: 'The error has been reported. You can try again, or use the navigation to go somewhere else.',
  },
});
