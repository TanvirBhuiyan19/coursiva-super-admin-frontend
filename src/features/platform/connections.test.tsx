import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audit, platformSettings, session } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { CLAMAV_UNREACHABLE_HOST, connectionStore, DISCORD_REFUSED_BOT_TOKEN, DISCORD_USER_TOKEN, EXPO_REFUSED_TOKEN } from './mock';

const hasAudit = (action: string) => audit.all().some((a) => a.action === action && a.category === 'Security');
const sectionLink = (name: string) => within(screen.getByRole('navigation', { name: 'Connection types' })).getByRole('link', { name });
const stored = (key: string) => connectionStore.get().credentials.find((c) => c.connection === key);

describe('connections', () => {
  it('lists every service with masked secrets and the OAuth redirect URI', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/connections');
    expect(await screen.findByRole('region', { name: 'Stripe' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Video & storage.' })).toHaveAttribute('href', '/platform/media');
    await user.click(sectionLink('Custom domains'));
    expect(router.state.location.search).toBe('?section=cdn');
    const cf = await screen.findByRole('region', { name: 'Cloudflare for SaaS' });
    expect(within(cf).getByText('Connected')).toBeInTheDocument();
    expect(within(cf).getByLabelText('Cloudflare for SaaS API token')).toHaveAttribute('placeholder', 'API token · •••• f03a');
    expect(document.body.innerHTML).not.toContain('cf-tok-9d2a61c4e8b7f03a');
    await user.click(sectionLink('Sign-in apps'));
    const zoom = await screen.findByRole('region', { name: 'Zoom OAuth app' });
    expect(within(zoom).getByText(/api\/v1\/oauth\/callback/)).toBeInTheDocument();
  });

  it('shows field errors and the provider’s refusal, then connects Stripe', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections');
    const card = await screen.findByRole('region', { name: 'Stripe' });
    await user.type(within(card).getByLabelText('Stripe Secret key'), 'nope');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('The secret key should start with sk_live_ or sk_test_ or rk_live_ or rk_test_.'),
    ).toBeInTheDocument();
    expect(within(card).getByText('Enter the Webhook signing secret.')).toBeInTheDocument();

    const secret = within(card).getByLabelText('Stripe Secret key');
    await user.clear(secret);
    await user.type(secret, 'sk_test_invalid_000000');
    await user.type(within(card).getByLabelText('Stripe Publishable key'), 'pk_test_51abc');
    await user.type(within(card).getByLabelText('Stripe Webhook signing secret'), 'whsec_0123456789abcdef');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('Stripe rejected these credentials: Invalid API Key provided')).toBeInTheDocument();
    expect(stored('stripe')).toBeUndefined();

    await user.clear(within(card).getByLabelText('Stripe Secret key'));
    await user.type(within(card).getByLabelText('Stripe Secret key'), 'sk_test_51Mock0123456789');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('stripe')?.values.secret_key).toBe('sk_test_51Mock0123456789'));
    expect(await screen.findByText('Stripe connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText('Stripe Secret key')).toHaveAttribute('placeholder', 'Secret key · •••• 6789');
    expect(within(card).getByLabelText('Stripe Publishable key')).toHaveAttribute('placeholder', 'Publishable key · pk_test_51abc');
    expect(hasAudit('Connected Stripe')).toBe(true);
  });

  it('asks for the password when it was not entered recently, then retries the change', async () => {
    signInAs('Owner');
    session.patch({ passwordConfirmedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    const { user } = renderApp('/platform/connections?section=email');
    const card = await screen.findByRole('region', { name: 'Postmark' });
    await user.type(within(card).getByLabelText('Postmark Server API token'), 'pm-server-token-5e1d0a9c');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));

    const dialog = await screen.findByRole('dialog', { name: 'Confirm your password' });
    await user.type(within(dialog).getByLabelText('Password'), 'wrong');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and continue' }));
    expect(await within(dialog).findByText('The provided password was incorrect.')).toBeInTheDocument();
    expect(stored('postmark')).toBeUndefined();

    await user.type(within(dialog).getByLabelText('Password'), 'password');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and continue' }));
    await waitFor(() => expect(stored('postmark')?.values.server_token).toBe('pm-server-token-5e1d0a9c'));
    expect(screen.queryByRole('dialog', { name: 'Confirm your password' })).not.toBeInTheDocument();
    expect(hasAudit('Connected Postmark')).toBe(true);
  });

  it('keeps the Postmark bounce webhook password optional and checks it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=email');
    const card = await screen.findByRole('region', { name: 'Postmark' });
    await user.type(within(card).getByLabelText('Postmark Server API token'), 'pm-server-token-5e1d0a9c');
    await user.type(within(card).getByLabelText('Postmark Webhook password (Basic auth)'), 'too short');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('Use at least 24 characters without spaces or colons, e.g. from `openssl rand -hex 24`.'),
    ).toBeInTheDocument();
    expect(stored('postmark')).toBeUndefined();

    const field = within(card).getByLabelText('Postmark Webhook password (Basic auth)');
    await user.clear(field);
    await user.type(field, '3f9c1a7e5b2d8f0c4a6e1b9d7c3f5a2e');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('postmark')?.values.webhook_password).toBe('3f9c1a7e5b2d8f0c4a6e1b9d7c3f5a2e'));
  });

  it('cancelling the password prompt leaves the credentials unchanged', async () => {
    signInAs('Owner');
    session.patch({ passwordConfirmedAt: null });
    const { user } = renderApp('/platform/connections?section=oauth');
    const card = await screen.findByRole('region', { name: 'Zoom OAuth app' });
    await user.click(within(card).getByRole('button', { name: 'Disconnect' }));
    await user.click(within(card).getByRole('button', { name: 'Confirm disconnect' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm your password' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Confirm your password to continue.')).toBeInTheDocument();
    expect(stored('oauth_zoom')).toBeDefined();
  });

  it('tests a connection, and hides changes from read-only staff', async () => {
    signInAs('Owner');
    const { user, unmount } = renderApp('/platform/connections?section=cdn');
    const cf = await screen.findByRole('region', { name: 'Cloudflare for SaaS' });
    await user.click(within(cf).getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Cloudflare for SaaS accepted the credentials (184 ms)')).toBeInTheDocument();
    unmount();

    signInAs('Read-only');
    renderApp('/platform/connections?section=cdn');
    const card = await screen.findByRole('region', { name: 'Cloudflare for SaaS' });
    expect(within(card).getByLabelText('Cloudflare for SaaS API token')).toBeDisabled();
    expect(within(card).queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('connects Expo push under its own section, showing the length check and Expo’s refusal', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/connections?section=cdn');
    await screen.findByRole('region', { name: 'Cloudflare for SaaS' });
    await user.click(sectionLink('Push notifications'));
    expect(router.state.location.search).toBe('?section=push');
    expect(screen.getByRole('heading', { name: 'Mobile app push' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Expo push' });
    expect(within(card).getByText('Not connected')).toBeInTheDocument();
    const token = within(card).getByLabelText('Expo push Access token');

    await user.type(token, 'short');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('That access token looks too short.')).toBeInTheDocument();

    await user.clear(token);
    await user.type(token, EXPO_REFUSED_TOKEN);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('Expo push rejected these credentials: the access token was refused')).toBeInTheDocument();
    expect(stored('expo')).toBeUndefined();

    await user.clear(token);
    await user.type(token, 'expo-access-token-3f9c1a7e5b2d');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('expo')?.values.access_token).toBe('expo-access-token-3f9c1a7e5b2d'));
    expect(await screen.findByText('Expo push connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText('Expo push Access token')).toHaveAttribute('placeholder', 'Access token · •••• 5b2d');
    expect(hasAudit('Connected Expo push')).toBe(true);
  });

  it('lists Paddle and Lemon Squeezy under payments, verifies them and guards disconnecting the active provider', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections');
    const payments = (await screen.findByRole('heading', { name: 'Payments' })).closest('.card') as HTMLElement;
    expect(
      within(payments)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Stripe', 'Paddle', 'Lemon Squeezy']);
    expect(within(payments).getByText(/\/api\/v1\/webhooks\/lemon-squeezy/)).toBeInTheDocument();

    const ls = within(payments).getByRole('region', { name: 'Lemon Squeezy' });
    expect(within(ls).getByText('Not connected')).toBeInTheDocument();
    await user.type(within(ls).getByLabelText('Lemon Squeezy Store ID'), 'store-1');
    await user.click(within(ls).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(ls).findByText('The store ID is a number, e.g. 12345.')).toBeInTheDocument();
    expect(within(ls).getByText('Enter the Growth monthly variant ID.')).toBeInTheDocument();

    const paddle = within(payments).getByRole('region', { name: 'Paddle' });
    expect(within(paddle).getByText('Connected')).toBeInTheDocument();
    await user.type(within(paddle).getByLabelText('Paddle Client-side token'), 'live_7c1e4b9a2d6f8e0c3b5a7d9f1e2');
    await user.click(within(paddle).getByRole('button', { name: 'Save & re-verify' }));
    expect(
      await within(paddle).findByText(
        'Paddle rejected these credentials: the API key and the client-side token are from different environments (sandbox and live)',
      ),
    ).toBeInTheDocument();
    expect(stored('paddle')?.values.client_token).toBe('test_7c1e4b9a2d6f8e0c3b5a7d9f1e2');

    platformSettings.patch({ billingProvider: 'paddle' });
    await user.click(within(paddle).getByRole('button', { name: 'Disconnect' }));
    await user.click(within(paddle).getByRole('button', { name: 'Confirm disconnect' }));
    expect(
      await screen.findByText('Paddle is the billing provider. Choose another one in Settings → Billing & dunning first.'),
    ).toBeInTheDocument();
    expect(stored('paddle')).toBeDefined();
  });

  it('lists the ad networks’ developer tokens under Ads & channels with their format checks', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/connections');
    await screen.findByRole('region', { name: 'Stripe' });
    await user.click(sectionLink('Ads & channels'));
    expect(router.state.location.search).toBe('?section=ads');
    const ads = screen.getByRole('heading', { name: 'Ads & channels' }).closest('.card') as HTMLElement;
    expect(
      within(ads)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Google Ads API', 'Microsoft Advertising API']);

    const google = within(ads).getByRole('region', { name: 'Google Ads API' });
    await user.type(within(google).getByLabelText('Google Ads API Developer token'), 'too-short');
    await user.click(within(google).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(google).findByText('The developer token is 22 letters, digits, - or _ (Google Ads → Tools → API Center).'),
    ).toBeInTheDocument();
    expect(stored('google_ads')).toBeUndefined();

    const microsoft = within(ads).getByRole('region', { name: 'Microsoft Advertising API' });
    await user.type(within(microsoft).getByLabelText('Microsoft Advertising API Developer token'), 'BBD37VB98');
    await user.click(within(microsoft).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('microsoft_ads')?.values.developer_token).toBe('BBD37VB98'));
    expect(hasAudit('Connected Microsoft Advertising API')).toBe(true);
  });

  it('connects the Chrome UX Report API key under Insights, refusing a malformed key', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=insights');
    expect(await screen.findByRole('heading', { name: 'Insights' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Chrome UX Report API' });
    expect(within(card).getByText('Not connected')).toBeInTheDocument();
    const key = within(card).getByLabelText('Chrome UX Report API API key');

    await user.type(key, 'AIzaTooShort');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('A Google API key is 39 characters starting with AIza (Google Cloud → APIs & Services → Credentials).'),
    ).toBeInTheDocument();
    expect(stored('google_crux')).toBeUndefined();

    const good = 'AIzaSyD4mock0Crux1Key2Abcdefghij_k-lmno';
    await user.clear(key);
    await user.type(key, good);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('google_crux')?.values.api_key).toBe(good));
    expect(await screen.findByText('Chrome UX Report API connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText('Chrome UX Report API API key')).toHaveAttribute('placeholder', `API key · •••• ${good.slice(-4)}`);
    expect(hasAudit('Connected Chrome UX Report API')).toBe(true);
  });

  it('connects the AI studio keys (Anthropic, AssemblyAI), refusing malformed keys', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=ai');
    expect(await screen.findByRole('heading', { name: 'AI studio' })).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Anthropic' });
    const section = screen.getByRole('heading', { name: 'AI studio' }).closest('.card') as HTMLElement;
    expect(
      within(section)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Anthropic', 'AssemblyAI']);

    const anthropic = within(section).getByRole('region', { name: 'Anthropic' });
    const claudeKey = within(anthropic).getByLabelText('Anthropic API key');
    await user.type(claudeKey, 'sk-live-not-a-claude-key');
    await user.click(within(anthropic).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(anthropic).findByText('An Anthropic API key starts with sk-ant- (Claude Console → API keys).')).toBeInTheDocument();
    expect(stored('anthropic')).toBeUndefined();
    const good = 'sk-ant-api03-mock0Key1Abcdefghij_klmno-pq';
    await user.clear(claudeKey);
    await user.type(claudeKey, good);
    await user.click(within(anthropic).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('anthropic')?.values.api_key).toBe(good));
    expect(await screen.findByText('Anthropic connected — credentials verified')).toBeInTheDocument();
    expect(hasAudit('Connected Anthropic')).toBe(true);

    const assembly = within(section).getByRole('region', { name: 'AssemblyAI' });
    const sttKey = within(assembly).getByLabelText('AssemblyAI API key');
    await user.type(sttKey, 'ABCDEF0123456789abcdef0123456789');
    await user.click(within(assembly).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(assembly).findByText('An AssemblyAI API key is 32 hexadecimal characters (AssemblyAI dashboard → API keys).'),
    ).toBeInTheDocument();
    expect(stored('assemblyai')).toBeUndefined();
    await user.clear(sttKey);
    await user.type(sttKey, '0123456789abcdef0123456789abcdef');
    await user.click(within(assembly).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('assemblyai')?.values.api_key).toBe('0123456789abcdef0123456789abcdef'));
    expect(hasAudit('Connected AssemblyAI')).toBe(true);
  });

  it('connects ClamAV under Security, refusing a bad host and a daemon that does not answer PING', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=security');
    expect(await screen.findByRole('heading', { name: 'Security' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'ClamAV' });
    expect(within(card).getByText('Not connected')).toBeInTheDocument();
    const host = within(card).getByLabelText('ClamAV Host');
    const port = within(card).getByLabelText('ClamAV Port');

    await user.type(host, 'clam av!');
    await user.type(port, '70000');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('The host must be a hostname or an IP address, e.g. clamav.internal.')).toBeInTheDocument();
    expect(within(card).getByText('The port must be between 1 and 65535.')).toBeInTheDocument();

    await user.clear(host);
    await user.type(host, CLAMAV_UNREACHABLE_HOST);
    await user.clear(port);
    await user.type(port, '3310');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText(`ClamAV rejected these credentials: no clamd answered PING at ${CLAMAV_UNREACHABLE_HOST}:3310`),
    ).toBeInTheDocument();
    expect(stored('clamav')).toBeUndefined();

    await user.clear(within(card).getByLabelText('ClamAV Host'));
    await user.type(within(card).getByLabelText('ClamAV Host'), '10.0.4.12');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('clamav')?.values).toEqual({ host: '10.0.4.12', port: '3310' }));
    expect(await screen.findByText('ClamAV connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText('ClamAV Host')).toHaveAttribute('placeholder', 'Host · 10.0.4.12');
    expect(hasAudit('Connected ClamAV')).toBe(true);
  });

  it('connects the Prometheus scrape token under Monitoring, refusing a short token', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=monitoring');
    expect(await screen.findByRole('heading', { name: 'Monitoring' })).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Prometheus metrics' });
    const token = within(card).getByLabelText('Prometheus metrics Scrape token');

    await user.type(token, 'too-short');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('Use a random token of at least 32 characters (for example: openssl rand -hex 32).'),
    ).toBeInTheDocument();
    expect(stored('metrics')).toBeUndefined();

    const good = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    await user.clear(token);
    await user.type(token, good);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('metrics')?.values.token).toBe(good));
    expect(await screen.findByText('Prometheus metrics connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText('Prometheus metrics Scrape token')).toHaveAttribute('placeholder', 'Scrape token · •••• 0a08');
    expect(document.body.innerHTML).not.toContain(good);
    expect(hasAudit('Connected Prometheus metrics')).toBe(true);
  });

  it('connects Daily under Live video for the schools’ built-in rooms, checking the key and the optional domain', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=video');
    expect(await screen.findByRole('heading', { name: 'Live video' })).toBeInTheDocument();
    expect(screen.getByText(/php artisan live:daily-webhook/)).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: 'Daily' });
    const key = within(card).getByLabelText('Daily API key');

    await user.type(key, 'not a key');
    await user.type(within(card).getByLabelText('Daily Domain'), 'example.com');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('A Daily API key is letters and digits (Daily dashboard → Developers → API key).'),
    ).toBeInTheDocument();
    expect(within(card).getByText('The domain looks like yourcompany.daily.co.')).toBeInTheDocument();
    expect(stored('daily')).toBeUndefined();

    const good = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    await user.clear(key);
    await user.type(key, good);
    await user.clear(within(card).getByLabelText('Daily Domain'));
    await user.type(within(card).getByLabelText('Daily Domain'), 'school.daily.co');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('daily')?.values).toMatchObject({ api_key: good, domain: 'school.daily.co' }));
    expect(await screen.findByText('Daily connected — credentials verified')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(good);
    expect(hasAudit('Connected Daily')).toBe(true);
  });

  it('hides the Security and Monitoring connect controls from a read-only role', async () => {
    signInAs('Read-only');
    renderApp('/platform/connections?section=security');
    const card = await screen.findByRole('region', { name: 'ClamAV' });
    expect(within(card).getByLabelText('ClamAV Host')).toBeDisabled();
    expect(within(card).queryByRole('button', { name: 'Connect & verify' })).not.toBeInTheDocument();
  });

  it('lists every OAuth provider the backend registers, with Meta’s configuration IDs and X’s consumer keys', async () => {
    signInAs('Owner');
    renderApp('/platform/connections?section=oauth');
    await screen.findByRole('region', { name: 'Zoom OAuth app' });
    const oauth = screen.getByRole('heading', { name: 'Apps schools sign in to' }).closest('.card') as HTMLElement;
    const names = within(oauth)
      .getAllByRole('region')
      .map((r) => r.getAttribute('aria-label'));
    for (const name of ['Meta', 'TikTok for Business', 'LinkedIn', 'Pinterest', 'X', 'Yandex'])
      expect(names).toContain(`${name} OAuth app`);
    expect(names).toHaveLength(22);

    const meta = within(oauth).getByRole('region', { name: 'Meta OAuth app' });
    expect(within(meta).getByLabelText('Meta OAuth app Login for Business configuration ID')).toBeInTheDocument();
    expect(
      within(meta).getByLabelText('Meta OAuth app Login for Business configuration ID for Page and Instagram posting'),
    ).toBeInTheDocument();
    const x = within(oauth).getByRole('region', { name: 'X OAuth app' });
    expect(within(x).getByLabelText('X OAuth app API key (consumer key)')).toBeInTheDocument();
    expect(within(x).getByText(/Register this callback URL in the X app/)).toBeInTheDocument();
    const yandex = within(oauth).getByRole('region', { name: 'Yandex OAuth app' });
    expect(within(yandex).getByLabelText('Yandex OAuth app Client secret')).toBeInTheDocument();
  });

  it('connects the Discord OAuth app with an optional bot token, verified as a bot', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/connections?section=oauth');
    const card = await screen.findByRole('region', { name: 'Discord OAuth app' });
    expect(within(card).getByText(/The bot token \(same application\) lets Coursiva add students/)).toBeInTheDocument();
    const label = 'Discord OAuth app Bot token (Bot → Reset Token in the Discord developer portal)';
    await user.type(within(card).getByLabelText('Discord OAuth app Client ID'), '1016450000000000000');
    await user.type(within(card).getByLabelText('Discord OAuth app Client secret'), 'discord-client-secret-4f8a');
    const token = within(card).getByLabelText(label);

    await user.type(token, 'too-short');
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('A Discord bot token is 50–200 letters, digits, dots, - or _.')).toBeInTheDocument();

    await user.clear(token);
    await user.type(token, DISCORD_REFUSED_BOT_TOKEN);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(
      await within(card).findByText('Discord OAuth app rejected these credentials: Discord refused the bot token'),
    ).toBeInTheDocument();

    await user.clear(token);
    await user.type(token, DISCORD_USER_TOKEN);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    expect(await within(card).findByText('Discord OAuth app rejected these credentials: the token is not a bot token')).toBeInTheDocument();
    expect(stored('oauth_discord')).toBeUndefined();

    const good = 'MTAxNjQ1MDAwMDAwMDAwMDAwMA.GmockB.bot-token-0123456789abcdefghijklmn';
    await user.clear(token);
    await user.type(token, good);
    await user.click(within(card).getByRole('button', { name: 'Connect & verify' }));
    await waitFor(() => expect(stored('oauth_discord')?.values.bot_token).toBe(good));
    expect(await screen.findByText('Discord OAuth app connected — credentials verified')).toBeInTheDocument();
    expect(within(card).getByLabelText(label)).toHaveAttribute(
      'placeholder',
      `Bot token (Bot → Reset Token in the Discord developer portal) · •••• ${good.slice(-4)}`,
    );
    expect(hasAudit('Connected Discord OAuth app')).toBe(true);
  });
});
