import { defineMessages } from '@/lib/i18n';

export const { t, useT } = defineMessages('announcements', {
  title: 'Announcements',
  audiences: { 'All tenants': 'All tenants', 'Launch plan': 'Launch plan', 'Growth plan': 'Growth plan', 'Scale plan': 'Scale plan' },
  /** Audience inside a sentence ("sent to scale plan"). */
  audiencesInline: { 'All tenants': 'all tenants', 'Launch plan': 'launch plan', 'Growth plan': 'growth plan', 'Scale plan': 'scale plan' },
  channels: { Banner: 'Banner', Email: 'Email', 'In-app': 'In-app' },
  /** Channel inside a sentence ("via email"). */
  channelsInline: { Banner: 'banner', Email: 'email', 'In-app': 'in-app' },
  composer: {
    title: 'New announcement',
    message: 'Message',
    characters: '{count} / {max} characters',
    placeholder: 'Write the announcement…',
    audience: 'Audience',
    reaches: { one: 'Reaches {count} tenant', other: 'Reaches {count} tenants' },
    channel: 'Channel',
    channelHints: {
      Banner: 'Shown as a dismissible banner across the tenant admin',
      Email: 'Emailed to every tenant owner',
      'In-app': 'Posted to the tenant admin notification centre',
    },
    send: 'Send announcement',
    sent: {
      one: 'Announcement sent to {audience} — {count} tenant via {channel}',
      other: 'Announcement sent to {audience} — {count} tenants via {channel}',
    },
    errors: {
      required: 'Write the announcement first.',
      max: 'Keep announcements under {max} characters.',
    },
  },
  history: {
    title: 'History',
    empty: 'No announcements sent yet.',
    label: 'Sent announcements',
    sentBy: 'Sent by {name}',
    sentOn: 'Sent · {date}',
    recipients: { one: '{count} tenant', other: '{count} tenants' },
    noun: 'announcements',
  },
});
