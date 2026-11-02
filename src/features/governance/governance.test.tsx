import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, dsars, staff, tenants } from '@/mocks/collections';
import { PLAN_LIMITS } from '@/mocks/reference';
import { renderApp, signInAs } from '@/test/utils';
import { IP_ERROR } from './ip';
import { acceptances, blockedIps, policies, rateLimits, reminders, reports, retention, signals } from './mock';

const audited = (text: string, category?: string) => audit.all().some((a) => a.action === text && (!category || a.category === category));

const sectionLink = (nav: string, name: string | RegExp) =>
  within(screen.getByRole('navigation', { name: nav })).getByRole('link', { name });

describe('governance access', () => {
  it('keeps Finance out of every governance screen', async () => {
    signInAs('Finance');
    renderApp('/governance/compliance');
    expect(await screen.findByText('You don’t have access to this screen')).toBeInTheDocument();
  });

  it('lets Read-only view but not act', async () => {
    staff.update('st_dana', { status: 'Active' }); // the seeded Read-only user is still an invite
    signInAs('Read-only');
    const { user } = renderApp('/governance/abuse');
    expect(await screen.findByRole('heading', { name: 'Abuse signals' })).toBeInTheDocument();
    expect(await screen.findByText('Bloom Floristry Courses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Freeze checkout' })).not.toBeInTheDocument();
    await user.click(sectionLink('Abuse sections', 'Rate limits'));
    expect(await screen.findByRole('textbox', { name: 'Growth requests per minute' })).toBeDisabled();
  });
});

describe('compliance & privacy', () => {
  const table = () => screen.findByRole('table', { name: 'Data subject requests' });

  it('pages through requests instead of stopping at a fixed cap', async () => {
    const now = Date.now();
    for (let i = 0; i < 30; i++)
      dsars.insert({
        id: `ds_bulk_${String(i)}`,
        requester: `bulk${String(i)}@example.com`,
        tenantId: 'tn_kodo',
        type: 'Access',
        receivedAt: new Date(now - i * 60_000).toISOString(),
        dueAt: new Date(now + 20 * 86_400_000).toISOString(),
        fulfilledAt: null,
      });
    signInAs('Owner');
    const { user } = renderApp('/governance/compliance');
    const t = await table();
    await waitFor(() => expect(within(t).getAllByRole('row').length).toBe(26)); // header + 25
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    await user.click(within(pager).getByRole('button', { name: /next/i }));
    await waitFor(() => expect(within(t).getAllByRole('row').length).toBeLessThan(26));
  });

  it('lists requests with deadlines computed from due dates', async () => {
    signInAs('Owner');
    renderApp('/governance/compliance');
    const t = await table();
    const overdue = await within(t).findByRole('row', { name: /beth\.alvarez/ });
    expect(within(overdue).getByText('2d overdue')).toBeInTheDocument();
    expect(within(within(t).getByRole('row', { name: /nadia\.osei/ })).getByRole('button', { name: 'Send report' })).toBeInTheDocument();
    expect(await screen.findByText('9 / 10')).toBeInTheDocument(); // DPAs signed, from policy acceptance
    // The section nav counts open requests.
    expect(within(screen.getByRole('navigation', { name: 'Compliance sections' })).getByText(/open data requests?$/)).toBeInTheDocument();
  });

  it('erases data only after confirming, and records it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/compliance');
    const row = await within(await table()).findByRole('row', { name: /carl\.j/ });
    await user.click(within(row).getByRole('button', { name: 'Erase data' }));
    expect(dsars.find('ds_2')!.fulfilledAt).toBeNull();
    await user.click(within(row).getByRole('button', { name: 'Confirm erase' }));
    await waitFor(() => expect(dsars.find('ds_2')!.fulfilledAt).not.toBeNull());
    expect(audited('Erased personal data for carl.j@outlook.com (DevPath Bootcamp)', 'Security')).toBe(true);
    expect(await screen.findByText(/Personal data erased for carl\.j@outlook\.com/)).toBeInTheDocument();
  });

  it('persists retention settings', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/governance/compliance');
    await user.click(await screen.findByRole('link', { name: 'Data retention' }));
    expect(router.state.location.search).toBe('?section=retention');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Audit & security logs retention' }), '3 years');
    await waitFor(() => expect(retention.get().periods.audit_logs).toBe('3 years'));
    expect(audited('Retention for audit & security logs set to 3 years', 'Security')).toBe(true);
  });

  it('is read-only without governance.manage', async () => {
    signInAs('Support');
    const { user } = renderApp('/governance/compliance');
    const t = await table();
    await within(t).findByRole('row', { name: /carl\.j/ });
    expect(within(t).queryByRole('button')).not.toBeInTheDocument();
    await user.click(sectionLink('Compliance sections', 'Data retention'));
    expect(await screen.findByRole('combobox', { name: 'Audit & security logs retention' })).toBeDisabled();
    await user.click(sectionLink('Compliance sections', 'Sub-processors'));
    expect(await screen.findByText('Stripe')).toBeInTheDocument();
  });
});

describe('trust & moderation', () => {
  const queue = () => screen.findByRole('region', { name: 'Report queue' });

  it('filters the queue by severity and keeps it in the URL', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/governance/moderation');
    await within(await queue()).findByRole('listitem', { name: /DMCA — Silva/ });
    await user.click(screen.getByRole('button', { name: 'High · 2' }));
    await waitFor(() => expect(router.state.location.search).toContain('severity=High'));
    await waitFor(async () => expect(within(await queue()).getAllByRole('listitem')).toHaveLength(2));
  });

  it('removes content after confirming; the third strike suspends publishing', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/moderation');
    const card = await within(await queue()).findByRole('listitem', { name: /DMCA — Silva/ });
    expect(within(card).getByRole('link', { name: 'Open tenant' })).toHaveAttribute('href', '/tenants/tn_silva');
    await user.click(within(card).getByRole('button', { name: 'Remove content' }));
    expect(reports.find('rp_1')!.decision).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(reports.find('rp_1')!.decision).toBe('removed'));
    expect(audited('DMCA upheld — removed content on Silva Culinary Arts', 'Tenants')).toBe(true);
    expect(audited('Publishing suspended for Silva Culinary Arts — 3 upheld strikes', 'Tenants')).toBe(true);
    expect(await screen.findByText('3 of 3 strikes')).toBeInTheDocument();
    expect(screen.getByText('Publishing suspended')).toBeInTheDocument();
  });

  it('limiting access is interim — the report stays open', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/moderation');
    const card = await within(await queue()).findByRole('listitem', { name: /Reported post — Amplify/ });
    await user.click(within(card).getByRole('button', { name: 'Limit access' }));
    await waitFor(() => expect(reports.find('rp_2')!.decision).toBe('limited'));
    const again = await within(await queue()).findByRole('listitem', { name: /Reported post — Amplify/ });
    expect(await within(again).findByText('Access limited')).toBeInTheDocument();
    expect(within(again).queryByRole('button', { name: 'Limit access' })).not.toBeInTheDocument();
    expect(within(again).getByRole('button', { name: 'No violation' })).toBeInTheDocument();
  });

  it('hides decisions from a view-only role (Support)', async () => {
    signInAs('Support');
    renderApp('/governance/moderation');
    const card = await within(await queue()).findByRole('listitem', { name: /DMCA — Silva/ });
    expect(within(card).queryByRole('button', { name: 'Remove content' })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open tenant' })).toBeInTheDocument();
  });
});

describe('policies & terms', () => {
  it('publishing a draft makes it live, supersedes the old version and opens a 30-day window', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/policies');
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(policies.find('pd_tos_42')!.state).toBe('Draft');
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }));
    await waitFor(() => expect(policies.find('pd_tos_42')!.state).toBe('Live'));
    expect(policies.find('pd_tos_41')!.state).toBe('Superseded');
    const days = (new Date(policies.find('pd_tos_42')!.acceptanceDeadline!).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(audited('Published Platform Terms of Service v4.2', 'Tenants')).toBe(true);
    // Nobody has accepted the new version yet.
    await user.click(sectionLink('Policy sections', 'Acceptance'));
    const list = await screen.findByRole('list', { name: 'Acceptance of Platform Terms of Service v4.2' });
    expect(within(list).queryByText(/^Accepted/)).not.toBeInTheDocument();
  });

  it('tracks reminders separately from acceptance', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/policies?section=acceptance');
    await user.click(await screen.findByRole('button', { name: 'Remind Silva Culinary Arts' }));
    expect(await screen.findByText(/Reminder sent to Silva Culinary Arts/)).toBeInTheDocument();
    expect(reminders.where((r) => r.tenantId === 'tn_silva' && r.documentId === 'pd_tos_41')).toHaveLength(1);
    expect(acceptances.where((a) => a.tenantId === 'tn_silva' && a.documentId === 'pd_tos_41')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Remind Silva Culinary Arts' })).not.toBeInTheDocument();
    expect(audited('Reminded Silva Culinary Arts to accept Platform Terms of Service v4.1', 'Tenants')).toBe(true);
  });

  it('switches the acceptance view by document (in the URL)', async () => {
    signInAs('Owner');
    const { user, router, unmount } = renderApp('/governance/policies?section=acceptance');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Document' }), 'dpa');
    await waitFor(() => expect(router.state.location.search).toContain('doc=dpa'));
    expect(await screen.findByText('9 of 10 tenants on Data Processing Agreement v2.3')).toBeInTheDocument();
    unmount();

    // Older links that only name the document still open its acceptance.
    renderApp('/governance/policies?doc=dpa');
    expect(await screen.findByText('9 of 10 tenants on Data Processing Agreement v2.3')).toBeInTheDocument();
    expect(sectionLink('Policy sections', 'Acceptance')).toHaveAttribute('aria-current', 'page');
  });

  it('drafts a new version, one draft per document', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/policies');
    await user.selectOptions(await screen.findByLabelText('Document'), 'aup');
    await user.type(screen.getByLabelText('New version'), 'v1.9');
    await user.type(screen.getByLabelText('What changed'), 'Clarifies AI content');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(policies.where((p) => p.docKey === 'aup' && p.state === 'Draft')).toHaveLength(1));
    expect(audited('Drafted Acceptable Use Policy v1.9', 'Tenants')).toBe(true);
    // ToS already has a draft (v4.2): the API refuses a second one.
    await user.selectOptions(screen.getByLabelText('Document'), 'tos');
    await user.type(screen.getByLabelText('New version'), 'v4.3');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('This document already has a draft — publish it first.')).toBeInTheDocument();
  });

  it('hides publish, drafting and remind from a view-only role (Support)', async () => {
    signInAs('Support');
    const { user } = renderApp('/governance/policies');
    // The title can appear more than once (e.g. a KPI line when a draft awaits publishing), so match any.
    expect((await screen.findAllByText(/Platform Terms of Service/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create draft' })).not.toBeInTheDocument();
    await user.click(sectionLink('Policy sections', 'Acceptance'));
    await screen.findByRole('list', { name: /Acceptance of Platform Terms of Service v4\.1/ });
    expect(screen.queryByRole('button', { name: /^Remind/ })).not.toBeInTheDocument();
  });
});

describe('data residency', () => {
  it('requests a move through the tenant endpoint and shows it as pending — never as moved', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/regions');
    const select = await screen.findByRole('combobox', { name: 'Data region for Kodo Design School' });
    expect(select).toHaveValue('APAC');
    await user.selectOptions(select, 'EU');
    // Like Laravel: a `region_request`; the data (and `region`) stay in APAC until the platform team migrates it.
    await waitFor(() => expect(tenants.find('tn_kodo')!.regionRequest?.region).toBe('EU'));
    expect(tenants.find('tn_kodo')!.region).toBe('APAC');
    expect(audited('Scheduled data-residency move for Kodo Design School: APAC → EU', 'Security')).toBe(true);
    const row = screen.getByRole('combobox', { name: 'Data region for Kodo Design School' }).closest('[role="row"]') as HTMLElement;
    expect(await within(row).findByText('Move requested')).toBeInTheDocument();
    expect(await screen.findByText(/requested — the data stays in APAC · Sydney until the platform team migrates it/)).toBeInTheDocument();
    // Still pending later: there is no fake 20-minute cutover.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 3_600_000);
    const { data } = await api.get<{ data: { tenants: { tenantId: string; migrating: boolean; requestedRegion: string | null }[] } }>(
      '/governance/regions',
    );
    vi.useRealTimers();
    expect(data.tenants.find((x) => x.tenantId === 'tn_kodo')).toMatchObject({ migrating: true, requestedRegion: 'EU' });
  });

  it('lists the UK region the API supports', async () => {
    tenants.update('tn_kodo', { region: 'UK' });
    signInAs('Owner');
    renderApp('/governance/regions');
    expect(await screen.findByRole('combobox', { name: 'Data region for Kodo Design School' })).toHaveValue('UK');
    expect(screen.getAllByText('UK · London').length).toBeGreaterThan(0);
  });

  it('needs tenants.manage to move a region', async () => {
    signInAs('Support');
    renderApp('/governance/regions');
    expect(await screen.findByRole('combobox', { name: 'Data region for Kodo Design School' })).toBeDisabled();
  });
});

describe('abuse & limits', () => {
  it('applies a signal action that changes the tenant', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/abuse');
    await user.click(await screen.findByRole('button', { name: 'Raise limit' }));
    await waitFor(() => expect(tenants.find('tn_kodo')!.limitOverrides.apiPerMinute).toBe(120));
    expect(signals.find('as_2')!.resolution).toBe('actioned');
    expect(await screen.findByText('API limit for Kodo Design School raised to 120 req/min')).toBeInTheDocument();
    expect(audited('Raise limit applied to Kodo Design School', 'Security')).toBe(true);
  });

  it('freezes checkout only after the school is typed back, and the drawer can unfreeze it', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/governance/abuse');
    await user.click(await screen.findByRole('button', { name: 'Freeze checkout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Freeze checkout for Bloom Floristry Courses?' });
    expect(dialog).toHaveTextContent('New card payments at Bloom Floristry Courses are refused right away');
    const freeze = within(dialog).getByRole('button', { name: 'Freeze checkout' });
    expect(freeze).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type Bloom Floristry Courses to confirm'), 'bloom floristry courses');
    await user.click(freeze);
    await waitFor(() => expect(tenants.find('tn_bloom')!.checkoutFrozenAt).toBeTruthy());
    expect(audited('Freeze checkout applied to Bloom Floristry Courses', 'Security')).toBe(true);

    // The school's drawer shows the freeze and lifts it.
    await router.navigate('/tenants/tn_bloom');
    const notice = await screen.findByText('Checkout frozen');
    await user.click(within(notice.parentElement!).getByRole('button', { name: 'Unfreeze checkout' }));
    await waitFor(() => expect(tenants.find('tn_bloom')!.checkoutFrozenAt).toBeNull());
    expect(await screen.findByText('Checkout unfrozen for Bloom Floristry Courses — card payments allowed again')).toBeInTheDocument();
    expect(audited('Unfroze checkout for Bloom Floristry Courses — new card payments allowed again', 'Security')).toBe(true);
  });

  it('dismisses a signal', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/abuse');
    await user.click(await screen.findByRole('button', { name: 'Dismiss signal for DevPath Bootcamp' }));
    await waitFor(() => expect(signals.find('as_3')!.resolution).toBe('dismissed'));
    await waitFor(() => expect(screen.queryByText('DevPath Bootcamp')).not.toBeInTheDocument());
  });

  it('rate limits default to the plan limits, validate, and persist', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/abuse?section=limits');
    const growth = await screen.findByRole('textbox', { name: 'Growth requests per minute' });
    expect(growth).toHaveValue(String(PLAN_LIMITS.Growth.apiPerMinute));
    expect(screen.getByRole('textbox', { name: 'Launch requests per minute' })).toHaveValue(String(PLAN_LIMITS.Launch.apiPerMinute));
    await user.clear(growth);
    await user.type(growth, '0');
    await user.click(screen.getByRole('button', { name: 'Apply limits' }));
    expect(await screen.findByText('From 1 to 100,000.')).toBeInTheDocument();
    expect(rateLimits.get().Growth).toBe(PLAN_LIMITS.Growth.apiPerMinute);
    await user.clear(growth);
    await user.type(growth, '450');
    await user.click(screen.getByRole('button', { name: 'Apply limits' }));
    await waitFor(() => expect(rateLimits.get().Growth).toBe(450));
    expect(audited('Set API rate limits — Launch 60 · Growth 450 · Scale 1000 req/min', 'Security')).toBe(true);
  });

  it('validates IPs client-side and server-side, and blocks a CIDR range', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/abuse?section=blocked');
    const input = await screen.findByRole('textbox', { name: 'IP address or CIDR range to block' });
    const before = blockedIps.all().length;
    await user.type(input, '999.1.1.1');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(await screen.findByText(IP_ERROR)).toBeInTheDocument();
    expect(blockedIps.all()).toHaveLength(before);

    await user.clear(input);
    await user.type(input, '203.0.113.42');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    expect(await screen.findByText('203.0.113.42 is already blocked.')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '2001:db8::/32');
    await user.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(blockedIps.where((b) => b.ip === '2001:db8::/32')).toHaveLength(1));
    expect(audited('Blocked IP 2001:db8::/32', 'Security')).toBe(true);
    const list = screen.getByRole('list', { name: 'Blocked IP addresses' });
    expect(await within(list).findByText('2001:db8::/32')).toBeInTheDocument();
  });

  it('unblocks only after confirming', async () => {
    signInAs('Owner');
    const { user } = renderApp('/governance/abuse?section=blocked');
    const list = await screen.findByRole('list', { name: 'Blocked IP addresses' });
    const row = within(list).getByText('198.51.100.7').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Unblock' }));
    expect(blockedIps.find('ip_2')).toBeDefined();
    await user.click(within(row).getByRole('button', { name: 'Confirm unblock 198.51.100.7' }));
    await waitFor(() => expect(blockedIps.find('ip_2')).toBeUndefined());
    expect(audited('Unblocked IP 198.51.100.7', 'Security')).toBe(true);
  });

  it('is read-only without governance.manage', async () => {
    signInAs('Support');
    const { user } = renderApp('/governance/abuse?section=limits');
    expect(await screen.findByRole('textbox', { name: 'Growth requests per minute' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Apply limits' })).not.toBeInTheDocument();
    await user.click(sectionLink('Abuse sections', 'Blocked IPs'));
    expect(await screen.findByRole('list', { name: 'Blocked IP addresses' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'IP address or CIDR range to block' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unblock' })).not.toBeInTheDocument();
    await user.click(sectionLink('Abuse sections', 'Signals'));
    expect(await screen.findByText('Bloom Floristry Courses')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Freeze checkout' })).not.toBeInTheDocument();
  });
});
