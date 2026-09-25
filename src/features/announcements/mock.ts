// Mock implementation of /announcements (what the Laravel AnnouncementController will do).
import { http } from 'msw';
import { tenants, type TenantRow } from '@/mocks/collections';
import { ago, collection, id } from '@/mocks/db';
import { authorize, handle, invalid, ok, paginate, readBody, recordAudit, route } from '@/mocks/http';
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_CHANNELS,
  ANNOUNCEMENT_MAX_LENGTH,
  type Announcement,
  type AnnouncementAudience,
  type AudienceReach,
  type NewAnnouncement,
} from './types';

type AnnouncementRow = Announcement;

const announcements = collection<AnnouncementRow>('announcements', () => [
  {
    id: 'an_seed1',
    message: 'Checkout maintenance window · Sep 14, 02:00–03:00 UTC',
    audience: 'All tenants',
    channel: 'Banner',
    recipients: 10,
    sentAt: ago({ d: 28 }),
    sentBy: 'Sam Ortega',
  },
  {
    id: 'an_seed2',
    message: 'WhatsApp automation steps are live for Scale plans',
    audience: 'Scale plan',
    channel: 'Email',
    recipients: 3,
    sentAt: ago({ d: 44 }),
    sentBy: 'Priya Shah',
  },
  {
    id: 'an_seed3',
    message: 'New EU data residency option now in beta',
    audience: 'All tenants',
    channel: 'In-app',
    recipients: 10,
    sentAt: ago({ d: 57 }),
    sentBy: 'Sam Ortega',
  },
]);

/** Tenants an audience reaches: every non-suspended tenant, optionally narrowed to one plan. */
function reach(audience: AnnouncementAudience): TenantRow[] {
  const live = tenants.where((t) => t.status !== 'Suspended');
  return audience === 'All tenants' ? live : live.filter((t) => `${t.plan} plan` === audience);
}

export const handlers = [
  http.get(
    route('/announcements/audiences'),
    handle(() => {
      authorize('announcements.send');
      return ok(ANNOUNCEMENT_AUDIENCES.map<AudienceReach>((audience) => ({ audience, tenants: reach(audience).length })));
    }),
  ),

  http.get(
    route('/announcements'),
    handle(({ request }) => {
      authorize('announcements.send');
      const rows = [...announcements.all()].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      return paginate(rows, request);
    }),
  ),

  http.post(
    route('/announcements'),
    handle(async ({ request }) => {
      const user = authorize('announcements.send');
      const body = await readBody<Partial<NewAnnouncement>>(request);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const errors: Record<string, string> = {};
      if (!message) errors.message = 'Write the announcement first.';
      else if (message.length > ANNOUNCEMENT_MAX_LENGTH) errors.message = `Keep announcements under ${ANNOUNCEMENT_MAX_LENGTH} characters.`;
      if (!body.audience || !ANNOUNCEMENT_AUDIENCES.includes(body.audience)) errors.audience = 'The selected audience is invalid.';
      if (!body.channel || !ANNOUNCEMENT_CHANNELS.includes(body.channel)) errors.channel = 'The selected channel is invalid.';
      if (Object.keys(errors).length) throw invalid(errors);
      const audience = body.audience!;
      const row: AnnouncementRow = {
        id: id('an'),
        message,
        audience,
        channel: body.channel!,
        recipients: reach(audience).length,
        sentAt: new Date().toISOString(),
        sentBy: user.name,
      };
      announcements.insert(row);
      recordAudit(`Broadcast to ${audience}: "${message}"`, 'Tenants');
      return ok(row, 201);
    }),
  ),
];
