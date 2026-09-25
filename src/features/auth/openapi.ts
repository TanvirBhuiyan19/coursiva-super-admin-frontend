import { defineSpec, noContent, ref, resource } from '@/openapi/dsl';

export const spec = defineSpec({
  tag: 'Auth',
  description: 'Laravel Sanctum SPA session with Fortify-style two-factor authentication and password confirmation.',
  endpoints: [
    {
      method: 'GET',
      path: '/auth/me',
      summary: 'The signed-in staff user and effective permissions',
      auth: 'authenticated',
      response: resource(ref('User')),
    },
    {
      method: 'POST',
      path: '/auth/login',
      summary: 'Sign in with email and password',
      description:
        'When the account has 2FA, returns `two_factor_required: true` and the session holds the pending user until the challenge. Rate-limit per email + IP.',
      auth: 'public',
      body: ref('LoginInput'),
      response: resource(ref('LoginResult')),
      audit: { text: 'Signed in to the platform console', category: 'Auth' },
      example: { body: { email: 'priya@coursiva.io', password: 'password', remember: true } },
    },
    {
      method: 'POST',
      path: '/auth/two-factor-challenge',
      summary: 'Complete sign-in with a TOTP code',
      auth: 'public',
      body: { type: 'object', required: ['code'], properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } } },
      response: resource(ref('User')),
      errors: [419],
      audit: { text: 'Signed in to the platform console (2FA)', category: 'Auth' },
      example: { skip: 'Needs a pending 2FA login (covered by src/features/auth/auth.test.tsx).' },
    },
    {
      method: 'POST',
      path: '/auth/confirm-password',
      summary: 'Unlock an idle-locked console (password confirmation)',
      auth: 'authenticated',
      body: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } },
      response: noContent(),
      audit: { text: 'Unlocked the console after an idle lock', category: 'Auth' },
      example: { body: { password: 'password' } },
    },
    {
      method: 'POST',
      path: '/auth/logout',
      summary: 'Sign out',
      auth: 'public',
      response: noContent(),
      audit: { text: 'Signed out', category: 'Auth' },
      example: {},
    },
  ],
});
