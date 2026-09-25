import { defineMessages } from '@/lib/i18n';

export const { t, useT } = defineMessages('auth', {
  login: {
    product: 'Platform console',
    signIn: 'Sign in',
    intro: 'Staff access only. Every session is logged.',
    email: 'Work email',
    password: 'Password',
    remember: 'Keep me signed in on this device',
    twoFactorTitle: 'Two-factor authentication',
    twoFactorIntro: 'Enter the 6-digit code from your authenticator app.',
    code: 'Authentication code',
    verify: 'Verify',
    differentAccount: '← Use a different account',
  },
  demo: {
    title: 'Demo accounts (mock API)',
    password: 'Password',
    code: '· 2FA code',
    roles: { Owner: 'Owner', Admin: 'Admin', Support: 'Support', Finance: 'Finance', 'Read-only': 'Read-only' },
  },
  validation: {
    email: 'Enter a valid email address.',
    password: 'Enter your password.',
    code: 'Enter the 6-digit code from your authenticator app.',
  },
  idle: {
    warningLabel: 'Session about to lock',
    stillThere: 'Still there?',
    locksIn: 'For security, the console locks in',
    secondsLeft: { one: 'second without activity.', other: 'seconds without activity.' },
    staySignedIn: 'Stay signed in',
    locked: 'Console locked',
    lockedIntro: 'You were inactive, so the console was locked. Enter your password to continue where you left off.',
    password: 'Password',
    unlock: 'Unlock',
    notYou: 'Not you? Sign out',
  },
});
