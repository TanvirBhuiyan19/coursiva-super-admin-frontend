// API resources for the console-wide shell endpoints (status, badges, notifications, search).
export interface PlatformStatus {
  operational: boolean;
  incident: { title: string; postedAt: string } | null;
}

export interface NavBadges {
  support: number;
}

export interface Notification {
  id: string;
  text: string;
  tone: 'good' | 'warn' | 'bad';
  createdAt: string;
  read: boolean;
  href: string | null;
}

export type SearchType = 'tenant' | 'invoice' | 'ticket' | 'staff';
export interface SearchResult {
  type: SearchType;
  id: string;
  label: string;
  sublabel: string;
  href: string;
}
