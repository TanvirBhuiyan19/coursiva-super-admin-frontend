import { arrayOf, defineSpec, noContent, ref, resource } from '@/openapi/dsl';

export const spec = defineSpec({
  tag: 'Shell',
  description: 'Console-wide endpoints: status pill, navigation badges, notifications and global search.',
  endpoints: [
    {
      method: 'GET',
      path: '/status',
      summary: 'Platform status (header pill, polled every 60 s)',
      auth: 'authenticated',
      response: resource(ref('PlatformStatus')),
    },
    { method: 'GET', path: '/badges', summary: 'Navigation badge counts', auth: 'authenticated', response: resource(ref('NavBadges')) },
    {
      method: 'GET',
      path: '/notifications',
      summary: 'Notifications, newest first',
      auth: 'authenticated',
      response: resource(arrayOf(ref('Notification'))),
    },
    {
      method: 'POST',
      path: '/notifications/read-all',
      summary: 'Mark all notifications read',
      auth: 'authenticated',
      response: noContent(),
      example: {},
    },
    {
      method: 'GET',
      path: '/search',
      summary: 'Global search (only record types the user may view; max 20)',
      auth: 'authenticated',
      query: { q: { type: 'string' }, type: { type: 'string', enum: ['tenant', 'invoice', 'ticket', 'staff'] } },
      response: resource(arrayOf(ref('SearchResult'))),
      example: { query: { q: 'a' } },
    },
  ],
});
