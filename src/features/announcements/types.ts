// API resources for /announcements. These types are the contract the Laravel AnnouncementResource must match.
export const ANNOUNCEMENT_AUDIENCES = ['All tenants', 'Launch plan', 'Growth plan', 'Scale plan'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const ANNOUNCEMENT_CHANNELS = ['Banner', 'Email', 'In-app'] as const;
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];

export const ANNOUNCEMENT_MAX_LENGTH = 500;

export interface Announcement {
  id: string;
  message: string;
  audience: AnnouncementAudience;
  channel: AnnouncementChannel;
  /** Tenants the announcement reached when it was sent (suspended tenants are skipped). */
  recipients: number;
  sentAt: string;
  sentBy: string;
}

export interface NewAnnouncement {
  message: string;
  audience: AnnouncementAudience;
  channel: AnnouncementChannel;
}

export interface AudienceReach {
  audience: AnnouncementAudience;
  tenants: number;
}

export interface AnnouncementListParams {
  page?: number;
  perPage?: number;
}
