import { arrayOf, defineSpec, paginated, ref, resource } from '@/openapi/dsl';

export const spec = defineSpec({
  tag: 'Announcements',
  description: 'Broadcasts to tenant admins (banner, email or in-app). Suspended tenants are never reached.',
  endpoints: [
    {
      method: 'GET',
      path: '/announcements/audiences',
      summary: 'Audiences and how many tenants each reaches',
      auth: 'announcements.send',
      response: resource(arrayOf(ref('AudienceReach'))),
    },
    {
      method: 'GET',
      path: '/announcements',
      summary: 'Sent announcements, newest first',
      auth: 'announcements.send',
      query: {
        page: { type: 'integer', description: 'Page number (1-based).' },
        per_page: { type: 'integer', description: 'Items per page (max 100, default 25).' },
      },
      response: paginated(ref('Announcement')),
      example: { query: { per_page: 5 } },
    },
    {
      method: 'POST',
      path: '/announcements',
      summary: 'Send an announcement',
      description: 'Message is trimmed and must be 1–500 characters. `recipients` is the audience reach at send time.',
      auth: 'announcements.send',
      body: ref('NewAnnouncement'),
      response: resource(ref('Announcement'), 201),
      audit: { text: 'Broadcast to {audience}: "{message}"', category: 'Tenants' },
      example: { body: { message: 'Scheduled maintenance on Sunday', audience: 'Growth plan', channel: 'Email' } },
    },
  ],
});
