import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, flags, platformStatus } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { apiKeys, certificates, deliveries, imports, policies, senders } from './mock';

const sectionLink = (nav: string, name: string | RegExp) =>
  within(screen.getByRole('navigation', { name: nav })).getByRole('link', { name });

const audited = (text: string | RegExp) =>
  audit.all().some((a) => (typeof text === 'string' ? a.action === text : text.test(a.action)) && a.actorName === 'Sam Ortega');

describe('flags & system status', () => {
  it('lists flags and persists a toggle and a rollout change', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/flags');
    const toggle = await screen.findByRole('switch', { name: 'Multi-currency checkout' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(flags.find('multi_currency')!.enabled).toBe(true));
    expect(audited('Enabled "Multi-currency checkout" for all tenants')).toBe(true);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Multi-currency checkout rollout' }), 'Scale only');
    await waitFor(() => expect(flags.find('multi_currency')!.rollout).toBe('Scale only'));
    expect(audited('Set "Multi-currency checkout" rollout to scale only')).toBe(true);
  });

  it('posting an incident updates the header status, and resolving clears it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/flags?section=status');
    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Post incident' }));
    const form = screen.getByRole('form', { name: 'Post an incident' });
    await user.click(within(form).getByRole('button', { name: /post to status page/i }));

    expect(await screen.findByText('Degraded performance')).toBeInTheDocument();
    expect(platformStatus.get().incident?.title).toBe('Elevated video processing delays');
    const services = screen.getAllByRole('listitem').filter((li) => li.textContent.includes('Video processing & CDN'));
    expect(within(services[0]!).getByText('Degraded')).toBeInTheDocument();
    expect(audited('Posted incident: Elevated video processing delays')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Resolve incident' }));
    expect(await screen.findByText('All systems operational')).toBeInTheDocument();
    expect(platformStatus.get().incident).toBeNull();
  });

  it('validates the incident form', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/flags?section=status');
    await user.click(await screen.findByRole('button', { name: 'Post incident' }));
    const form = screen.getByRole('form', { name: 'Post an incident' });
    await user.clear(within(form).getByLabelText('Incident title'));
    await user.click(within(form).getByRole('checkbox', { name: 'Video processing & CDN' }));
    await user.click(within(form).getByRole('button', { name: /post to status page/i }));
    expect(await within(form).findByText('Describe the incident in at least 5 characters.')).toBeInTheDocument();
    expect(within(form).getByText('Pick at least one affected service.')).toBeInTheDocument();
    expect(platformStatus.get().incident).toBeNull();
  });

  it('validates and sends a broadcast, audited under Tenants', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/flags?section=broadcast');
    const send = await screen.findByRole('button', { name: 'Send' });
    await user.click(send);
    expect(await screen.findByText('Write the announcement.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Announcement message'), 'New: AI outline assistant is live');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Audience' }), 'Scale plan');
    await user.click(send);
    expect(await screen.findByText(/Announcement sent to scale plan/)).toBeInTheDocument();
    // Banners share the Announcements history (one owner).
    const { data } = await api.get<{ data: { message: string; audience: string; channel: string }[] }>('/announcements');
    expect(data.find((a) => a.message === 'New: AI outline assistant is live')).toMatchObject({
      audience: 'Scale plan',
      channel: 'Banner',
    });
    const entry = audit.all().find((a) => a.action === 'Broadcast to Scale plan: "New: AI outline assistant is live"');
    expect(entry?.category).toBe('Tenants');
  });

  it('is view-only for a Support role, and the API refuses changes', async () => {
    signInAs('Support');
    // Broadcast isn't a section for staff who can't send announcements: its URL falls back to the first section.
    const { user } = renderApp('/platform/flags?section=broadcast');
    expect(await screen.findByRole('switch', { name: 'Multi-currency checkout' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Multi-currency checkout rollout' })).toBeDisabled();
    const nav = screen.getByRole('navigation', { name: 'Flags and status sections' });
    expect(within(nav).queryByRole('link', { name: 'Broadcast' })).not.toBeInTheDocument();
    expect(screen.queryByText('Broadcast announcement')).not.toBeInTheDocument();
    await user.click(sectionLink('Flags and status sections', 'System status'));
    expect(await screen.findByText('Video processing & CDN')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post incident' })).not.toBeInTheDocument();
    await expect(api.patch('/platform/flags/multi_currency', { enabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(api.post('/platform/incident', { title: 'Outage now', serviceIds: ['api'] })).rejects.toMatchObject({ status: 403 });
    await expect(api.post('/announcements', { message: 'Hi', audience: 'All tenants', channel: 'Banner' })).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('sectioned platform screens', () => {
  it('keeps the section in the URL: links, deep links and back/forward', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/flags');
    expect(await screen.findByRole('switch', { name: 'Multi-currency checkout' })).toBeInTheDocument();
    expect(sectionLink('Flags and status sections', 'System status')).toHaveAttribute('href', '?section=status');
    await user.click(sectionLink('Flags and status sections', 'System status'));
    expect(router.state.location.search).toBe('?section=status');
    expect(await screen.findByRole('button', { name: 'Post incident' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Multi-currency checkout' })).not.toBeInTheDocument();
    await router.navigate(-1);
    expect(await screen.findByRole('switch', { name: 'Multi-currency checkout' })).toBeInTheDocument();
  });

  it('opens the status section from the header status pill', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/tenants');
    await user.click(await screen.findByRole('button', { name: 'All systems operational' }));
    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/platform/flags?section=status'));
    expect(await screen.findByRole('button', { name: 'Post incident' })).toBeInTheDocument();
  });

  it.each([
    ['/platform/deliverability', 'Deliverability sections', 'Suppression list', '?section=suppression'],
    ['/platform/certificates', 'Certificate sections', 'Registry policy', '?section=policy'],
    ['/platform/standards', 'Standards sections', 'Accessibility', '?section=a11y'],
    ['/platform/api', 'API sections', 'Webhook endpoints', '?section=webhooks'],
    ['/platform/connections', 'Connection types', 'Custom domains', '?section=cdn'],
  ])('%s opens "%s → %s" and keeps it in the URL', async (path, nav, label, search) => {
    signInAs('Owner');
    const { user, router } = renderApp(path);
    const link = within(await screen.findByRole('navigation', { name: nav })).getByRole('link', { name: new RegExp(`^${label}`) });
    await user.click(link);
    expect(router.state.location.search).toBe(search);
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('counts failed webhook deliveries in the section nav', async () => {
    signInAs('Owner');
    renderApp('/platform/api');
    const nav = await screen.findByRole('navigation', { name: 'API sections' });
    expect(await within(nav).findByText(/^\d+ failed deliver(y|ies)$/)).toBeInTheDocument();
  });
});

describe('email deliverability', () => {
  it('shows risk bands and persists a sending pause', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/deliverability');
    const table = await screen.findByRole('table', { name: 'Sending domains' });
    const devpath = await within(table).findByRole('row', { name: /DevPath Bootcamp/ });
    expect(within(devpath).getByText('Over threshold')).toBeInTheDocument();
    expect(within(within(table).getByRole('row', { name: /Silva Culinary Arts/ })).getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText(/DevPath Bootcamp and Bloom Floristry Courses are past/)).toBeInTheDocument();

    await user.click(within(devpath).getByRole('button', { name: 'Pause sending for DevPath Bootcamp' }));
    await waitFor(() => expect(senders.find('sd_devpath')!.pausedAt).not.toBeNull());
    expect(await within(devpath).findByText('Sending paused')).toBeInTheDocument();
    expect(audited('Paused email sending for DevPath Bootcamp')).toBe(true);
    expect(audit.all().find((a) => a.action === 'Paused email sending for DevPath Bootcamp')?.category).toBe('Tenants');

    await user.click(within(devpath).getByRole('button', { name: 'Resume sending for DevPath Bootcamp' }));
    await waitFor(() => expect(senders.find('sd_devpath')!.pausedAt).toBeNull());
  });

  it('hides sending controls without platform.manage', async () => {
    signInAs('Support');
    renderApp('/platform/deliverability');
    const table = await screen.findByRole('table', { name: 'Sending domains' });
    await within(table).findByRole('row', { name: /DevPath Bootcamp/ });
    expect(within(table).queryByRole('button', { name: /Pause sending/ })).not.toBeInTheDocument();
    await expect(api.post('/platform/sender-domains/sd_devpath/pause')).rejects.toMatchObject({ status: 403 });
  });
});

describe('certificate authority', () => {
  it('searches via the URL, revokes after confirming, and reinstates', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/platform/certificates');
    const table = await screen.findByRole('table', { name: 'Certificates' });
    await within(table).findByText('AC-2026-0341');
    await user.type(screen.getByRole('searchbox', { name: 'Search certificates' }), 'freja');
    await waitFor(() => expect(router.state.location.search).toContain('q=freja'));
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2));

    const row = within(table).getByRole('row', { name: /NY-2026-1188/ });
    await user.click(within(row).getByRole('button', { name: 'Revoke' }));
    expect(certificates.find('NY-2026-1188')!.revokedAt).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(certificates.find('NY-2026-1188')!.revokedAt).not.toBeNull());
    expect(await within(row).findByText('Revoked')).toBeInTheDocument();
    expect(audit.all().find((a) => a.action === 'Revoked certificate NY-2026-1188 (Freja Lind)')?.category).toBe('Security');

    await user.click(within(row).getByRole('button', { name: 'Reinstate' }));
    await waitFor(() => expect(certificates.find('NY-2026-1188')!.revokedAt).toBeNull());
  });

  it('copies the verify link and persists a registry policy', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/certificates');
    await user.click(await screen.findByRole('button', { name: 'Copy verify link for AC-2026-0341' }));
    expect(await navigator.clipboard.readText()).toBe('https://verify.coursiva.io/AC-2026-0341');
    await user.click(sectionLink('Certificate sections', 'Registry policy'));
    await user.click(await screen.findByRole('switch', { name: 'Publish as Open Badges 3.0' }));
    await waitFor(() => expect(policies.find('ob3')!.enabled).toBe(true));
  });

  it('hides revoke without platform.manage', async () => {
    signInAs('Support');
    const { user } = renderApp('/platform/certificates');
    const table = await screen.findByRole('table', { name: 'Certificates' });
    await within(table).findByText('AC-2026-0341');
    expect(within(table).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    await user.click(sectionLink('Certificate sections', 'Registry policy'));
    expect(await screen.findByRole('switch', { name: 'Publish as Open Badges 3.0' })).toBeDisabled();
    await expect(api.post('/platform/certificates/AC-2026-0341/revoke')).rejects.toMatchObject({ status: 403 });
  });
});

describe('standards & conformance', () => {
  it('shows unmeasured xAPI/LTI counts as a dash, never as 0 (Laravel sends null)', async () => {
    signInAs('Owner');
    renderApp('/platform/standards');
    const xapi = (await screen.findByText('xAPI statements · 24h')).closest('.card') as HTMLElement;
    expect(within(xapi).getByText('—')).toBeInTheDocument();
    expect(within(xapi).queryByText('0')).not.toBeInTheDocument();
  });

  it('re-processes a failed import and removes it from the queue', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/standards');
    expect(await screen.findByRole('table', { name: 'Supported standards' })).toBeInTheDocument();
    expect(await screen.findByText('LTI 1.3 / Advantage')).toBeInTheDocument();
    await user.click(sectionLink('Standards sections', /^Failed imports/));
    await user.click(await screen.findByRole('button', { name: 'Re-process chef-basics-scorm2004.zip' }));
    expect(await screen.findByText(/chef-basics-scorm2004.zip imported and converted/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('chef-basics-scorm2004.zip')).not.toBeInTheDocument());
    expect(imports.find('im_chef')).toMatchObject({ outcome: 'imported' });
    expect(imports.find('im_chef')!.resolvedAt).not.toBeNull();
  });

  it('hides re-process for a Support role', async () => {
    signInAs('Support');
    renderApp('/platform/standards?section=imports');
    expect(await screen.findByText('react-module-4.zip')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Re-process/ })).not.toBeInTheDocument();
  });
});

describe('API & webhooks', () => {
  it('validates, then shows the new secret once and only the masked prefix afterwards', async () => {
    signInAs('Owner');
    const { user, client } = renderApp('/platform/api');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create an API key' });
    await user.click(within(dialog).getByRole('button', { name: /create key/i }));
    expect(await within(dialog).findByText(/Name the key/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Key name'), 'Metabase sync');
    await user.click(within(dialog).getByRole('radio', { name: 'Full access' }));
    // Full access names what the key can do and is confirmed by typing the scope.
    expect(within(dialog).getByText(/can do everything you can/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /create key/i })).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type FULL ACCESS to confirm'), 'full access');
    await user.click(within(dialog).getByRole('button', { name: /create key/i }));

    const secretDialog = await screen.findByRole('dialog', { name: 'Copy your new API key' });
    const secret = within(secretDialog).getByRole<HTMLInputElement>('textbox').value;
    expect(secret).toMatch(/^sk_live_[0-9a-f]{40}$/);
    await user.click(within(secretDialog).getByRole('button', { name: 'Copy key' }));
    expect(await navigator.clipboard.readText()).toBe(secret);
    await user.click(within(secretDialog).getByRole('button', { name: 'Done' }));

    const list = await screen.findByRole('list', { name: 'API keys' });
    expect(await within(list).findByText('Metabase sync')).toBeInTheDocument();
    expect(within(list).getByText(`sk_live_••••${secret.slice(-4)}`)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(secret);
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(secret);
    expect(apiKeys.where((k) => k.name === 'Metabase sync')[0]).toMatchObject({ scope: 'Full access', revokedAt: null });
    expect(audit.all().find((a) => a.action.startsWith('Created API key "Metabase sync"'))?.category).toBe('Security');
  });

  it('revokes a key after confirming and retries a failed delivery', async () => {
    signInAs('Owner');
    const { user } = renderApp('/platform/api');
    const list = await screen.findByRole('list', { name: 'API keys' });
    const zapier = within(list)
      .getAllByRole('listitem')
      .find((li) => li.textContent.includes('Zapier integration'))!;
    await user.click(within(zapier).getByRole('button', { name: 'Revoke' }));
    await user.click(within(zapier).getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() => expect(apiKeys.find('ak_zapier')!.revokedAt).not.toBeNull());
    expect(await within(zapier).findByText('Revoked')).toBeInTheDocument();

    // Laravel sends `events` as an array: each event is a list item, `*` reads as "All events".
    await user.click(sectionLink('API sections', 'Webhook endpoints'));
    const amplifyEvents = await screen.findByRole('list', { name: 'Events sent to hooks.amplifycoaching.com/coursiva' });
    expect(
      within(amplifyEvents)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['order.completed', 'refund.created']);
    expect(
      within(screen.getByRole('list', { name: 'Events sent to api.devpath.io/webhooks' })).getByText('All events'),
    ).toBeInTheDocument();

    await user.click(sectionLink('API sections', /^Failed deliveries/));
    await user.click(await screen.findByRole('button', { name: 'Retry invoice.paid to api.devpath.io/webhooks' }));
    expect(await screen.findByText('invoice.paid delivered — 200 OK')).toBeInTheDocument();
    expect(deliveries.find('dl_2')).toBeUndefined();

    await user.click(screen.getByRole('button', { name: 'Retry tenant.suspended to hooks.bloomfloristry.com' }));
    expect(await screen.findByText(/tenant.suspended failed again/)).toBeInTheDocument();
    expect(deliveries.find('dl_3')!.attempts).toBe(9);
  });

  it('hides key management from a Support role and the API refuses it', async () => {
    signInAs('Support');
    renderApp('/platform/api');
    const list = await screen.findByRole('list', { name: 'API keys' });
    expect(within(list).getByText('Production key')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument();
    await expect(api.post('/platform/api-keys', { name: 'Sneaky', scope: 'Full access' })).rejects.toMatchObject({ status: 403 });
  });
});
