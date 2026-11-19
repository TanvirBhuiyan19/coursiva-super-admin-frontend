import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit, flags, platformStatus, rolePermissions, tenants } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { aiSettings, aiUsageRows, experiments, jobQueues } from './mock';

describe('growth analytics', () => {
  it('shows tenant-derived revenue, funnel and onboarding figures', async () => {
    signInAs('Owner');
    renderApp('/analytics/growth');
    // 9 paying tenants, $4,491 paying MRR → $499 per tenant (same as /tenants/summary arpa).
    expect(await screen.findByText('$499/mo')).toBeInTheDocument();
    expect(screen.getByText('9 paying tenants')).toBeInTheDocument();
    // No NPS survey exists: the KPI says so instead of showing a number.
    const nps = screen.getByText('Average NPS').parentElement!;
    expect(within(nps).getByText('Not tracked')).toBeInTheDocument();
    const funnel = screen.getByRole('table', { name: /Acquisition funnel/ });
    expect(within(funnel).getByRole('row', { name: /Visitors Not tracked/ })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: /Cohort retention/ })).getAllByRole('row')).toHaveLength(7);
    const stuck = screen.getByRole('heading', { name: 'Stuck in onboarding' }).closest('section')!;
    expect(within(stuck).getByText('Ledger Finance Academy')).toBeInTheDocument();
    expect(within(stuck).getByText(/Stuck at “Paid subscription” for \d+ days/)).toBeInTheDocument();
  });
});

/** Adds `n` schools (cloned from the first seed) so the lists outgrow their top-10 cards. */
function addSchools(n: number) {
  const base = tenants.all()[0]!;
  for (let i = 1; i <= n; i++)
    tenants.insert({ ...base, id: `tn_extra${String(i).padStart(2, '0')}`, name: `Zz Extra School ${String(i).padStart(2, '0')}` });
}

describe('full lists behind the top-10 cards', () => {
  it('pages through every health score from the growth screen, page in the URL', async () => {
    addSchools(20);
    const total = tenants.all().length;
    signInAs('Owner');
    const { user } = renderApp('/analytics/growth');
    const card = (await screen.findByRole('heading', { name: 'Tenant health scores' })).closest('section')!;
    await waitFor(() => expect(within(card).getAllByRole('listitem')).toHaveLength(10));
    await user.click(within(card).getByRole('button', { name: `View all ${String(total)} tenants` }));
    expect(await within(card).findByText(`1–25 of ${String(total)} tenants`)).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem')).toHaveLength(25);
    await user.click(within(card).getByRole('button', { name: /Next/ }));
    expect(await within(card).findByText(`26–${String(total)} of ${String(total)} tenants`)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Show top 10' }));
    await waitFor(() => expect(within(card).getAllByRole('listitem')).toHaveLength(10));
  });

  it('serves the health ranking paginated, best first, with whitelisted sorts only', async () => {
    signInAs('Owner');
    const page = await api.get<{ data: { score: number }[]; meta: { total: number; perPage: number } }>('/analytics/growth/health-scores', {
      query: { perPage: 3 },
    });
    expect(page.data).toHaveLength(3);
    expect(page.meta).toMatchObject({ total: tenants.all().length, perPage: 3 });
    expect(page.data[0]!.score).toBeGreaterThanOrEqual(page.data[2]!.score);
    await expect(api.get('/analytics/growth/health-scores', { query: { sort: 'mrr' } })).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 422,
    );
  });

  it('pages through every tenant with AI usage from the AI screen', async () => {
    addSchools(12);
    for (let i = 1; i <= 12; i++) aiUsageRows.insert({ id: `tn_extra${String(i).padStart(2, '0')}`, tokensK: i, topFeature: 'chat' });
    const total = aiUsageRows.all().length;
    signInAs('Owner');
    const { user } = renderApp('/analytics/ai');
    const t = await screen.findByRole('table', { name: 'AI usage by tenant' });
    // The card carries the 10 heaviest (+ the header row); the lightest extra school is not among them.
    expect(within(t).getAllByRole('row')).toHaveLength(11);
    expect(within(t).queryByText('Zz Extra School 01')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `View all ${String(total)} tenants` }));
    expect(await screen.findByText(`1–${String(total)} of ${String(total)} tenants`)).toBeInTheDocument();
    expect(screen.getByText('Zz Extra School 01')).toBeInTheDocument();
    const byName = await api.get<{ data: { name: string }[]; meta: { total: number } }>('/analytics/ai/tenants', {
      query: { perPage: 2, sort: 'name' },
    });
    expect(byName.meta.total).toBe(total);
    expect(byName.data.map((r) => r.name)).toEqual([...byName.data.map((r) => r.name)].sort());
  });

  it('refuses the full lists without analytics.view', async () => {
    rolePermissions.patch({ Support: rolePermissions.get().Support.filter((p) => p !== 'analytics.view') });
    signInAs('Support');
    for (const path of ['/analytics/growth/health-scores', '/analytics/ai/tenants'])
      await expect(api.get(path)).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 403);
  });
});

describe('usage & infrastructure', () => {
  it('sums tenant usage into platform capacity and flags overages', async () => {
    signInAs('Owner');
    renderApp('/analytics/usage');
    expect(await screen.findByText('62.4 TB')).toBeInTheDocument();
    expect(screen.getByText('Approaching limit · 87% used')).toBeInTheDocument();
    const t = screen.getByRole('table', { name: 'Top consumers' });
    expect(within(t).getAllByRole('row')).toHaveLength(6);
    const devpath = within(t).getByRole('row', { name: /DevPath Bootcamp/ });
    expect(within(devpath).getByText('AI credits overage · +$114')).toBeInTheDocument();
  });

  it('shows the five meters with their source and freshness', async () => {
    signInAs('Owner');
    renderApp('/analytics/usage');
    const card = await screen.findByRole('region', { name: 'Video delivered' });
    expect(within(card).getByText(/Minutes of video Mux delivered to learners this month/)).toBeInTheDocument();
    expect(within(card).getByText(/^Updated /)).toBeInTheDocument();
  });
});

describe('system health', () => {
  it('retries failed jobs, persists and audits it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/health');
    await user.click(await screen.findByRole('button', { name: 'Retry 23 failed jobs on emails' }));
    expect(await screen.findByText('23 failed jobs requeued on emails')).toBeInTheDocument();
    expect(jobQueues.find('emails')).toMatchObject({ failed: 0, depth: 171 });
    expect(audit.all().some((a) => a.action === 'Requeued 23 failed jobs on the emails queue' && a.category === 'Flags')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('button', { name: /on emails$/ })).not.toBeInTheDocument());
  });

  it('shows the platform incident from the shared status', async () => {
    platformStatus.set({ incident: { title: 'Video playback degraded in APAC', postedAt: new Date().toISOString() } });
    signInAs('Owner');
    renderApp('/analytics/health');
    expect(await screen.findByText('Video playback degraded in APAC')).toBeInTheDocument();
  });

  it('hides retry from roles without platform.manage, and the API refuses it', async () => {
    signInAs('Finance');
    renderApp('/analytics/health');
    expect(await screen.findByText('23 failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument();
    await expect(api.post('/analytics/health/queues/emails/retry')).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 403);
    expect(jobQueues.find('emails')!.failed).toBe(23);
  });
});

describe('AI usage & cost', () => {
  it('computes cost and billed overage from plan allowances', async () => {
    signInAs('Owner');
    renderApp('/analytics/ai');
    const t = await screen.findByRole('table', { name: 'AI usage by tenant' });
    // DevPath (Scale, 2,000k-credit allowance) used 2,480k: cost 2480 × $0.42 = $1,042, overage 480k × $0.60.
    const devpath = within(t).getByRole('row', { name: /DevPath Bootcamp/ });
    expect(within(devpath).getByText('2,480k of 2,000k')).toBeInTheDocument();
    expect(within(devpath).getByText('$1,042')).toBeInTheDocument();
    expect(within(devpath).getByText('+$288 billed')).toBeInTheDocument();
    // Model cost (real provider spend) sits beside the credit cost: the mock's blended 2480 × $0.31 = $768.80.
    expect(within(t).getByRole('columnheader', { name: 'Credit cost' })).toBeInTheDocument();
    expect(within(t).getByRole('columnheader', { name: 'Model cost' })).toBeInTheDocument();
    expect(within(devpath).getByText(/^\$768(\.80)?$|^\$769$/)).toBeInTheDocument();
    // The KPI totals every tenant row: 4,307k credits × $0.31 = $1,335.17.
    expect(screen.getByText('Model cost · MTD')).toBeInTheDocument();
    expect(screen.getByText(/^\$1,335(\.17)?$/)).toBeInTheDocument();
    // Plan allowances mirror the backend's ai_credits limits (thousands of credits).
    expect(screen.getByText(/Launch 50k · Growth 600k · Scale 2,?000k credits/)).toBeInTheDocument();
  });

  it('throttles a tenant and persists it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/ai');
    await user.click(await screen.findByRole('button', { name: 'Throttle Nordic Yoga School' }));
    expect(await screen.findByText(/Nordic Yoga School throttled to the cheap model/)).toBeInTheDocument();
    expect(aiSettings.get().throttledTenantIds).toEqual(['tn_nordic']);
    expect(screen.getByRole('button', { name: 'Throttle Nordic Yoga School' })).toHaveAttribute('aria-pressed', 'true');
    expect(audit.all().some((a) => a.action === 'Throttled Nordic Yoga School to the low-cost AI model' && a.category === 'Billing')).toBe(
      true,
    );
  });

  it('validates and saves the monthly cap', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/ai');
    const cap = await screen.findByLabelText('Cap in dollars per month');
    await user.clear(cap);
    await user.type(cap, '50');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));
    expect(await screen.findByText('Set a cap between $100 and $100,000.')).toBeInTheDocument();
    await user.clear(cap);
    await user.type(cap, '3000');
    await user.click(screen.getByRole('button', { name: 'Save cap' }));
    await waitFor(() => expect(aiSettings.get().monthlyCap).toBe(3000));
    await user.selectOptions(screen.getByLabelText('Model routing policy'), 'balanced');
    await waitFor(() => expect(aiSettings.get().routingPolicy).toBe('balanced'));
  });

  it('is read-only without billing.manage', async () => {
    signInAs('Support');
    renderApp('/analytics/ai');
    expect(await screen.findByRole('table', { name: 'AI usage by tenant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Throttle/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cap in dollars per month')).toBeDisabled();
    expect(screen.getByLabelText('Model routing policy')).toBeDisabled();
    await expect(api.post('/analytics/ai/tenants/tn_nordic/throttle')).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 403);
  });
});

describe('experiments', () => {
  it('promotes only after confirming, ships the flag and audits it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/experiments');
    const t = await screen.findByRole('table', { name: 'Experiments' });
    const row = within(t).getByRole('row', { name: /New site builder/ });
    await user.click(within(row).getByRole('button', { name: 'Promote' }));
    expect(experiments.find('ex_site_builder')!.status).toBe('running');
    await user.click(within(row).getByRole('button', { name: 'Confirm promote' }));
    expect(await screen.findByText(/New site builder \(beta\) promoted to 100%/)).toBeInTheDocument();
    expect(experiments.find('ex_site_builder')!.status).toBe('shipped');
    expect(flags.find('site_builder_v2')).toMatchObject({ enabled: true, rollout: 'All tenants' });
    expect(audit.all().some((a) => a.action === 'Promoted experiment "New site builder (beta)" to 100%' && a.category === 'Flags')).toBe(
      true,
    );
    expect(await within(t).findByRole('row', { name: /New site builder.*Shipped to everyone/ })).toBeInTheDocument();
  });

  it('stops an experiment', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/experiments');
    const row = within(await screen.findByRole('table', { name: 'Experiments' })).getByRole('row', { name: /Advanced reports/ });
    await user.click(within(row).getByRole('button', { name: 'Stop' }));
    await user.click(within(row).getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() => expect(experiments.find('ex_advanced_reports')!.status).toBe('stopped'));
  });

  it('starts an experiment on a free flag, refuses a busy or live one and opens its arms', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/experiments');
    const table = await screen.findByRole('table', { name: 'Experiments' });

    // advanced_reports is on for every school by default: staff turned it off for the running experiment that owns it,
    // so the server refuses a second one as busy.
    flags.update('advanced_reports', { enabled: false });
    await user.click(screen.getByRole('button', { name: 'New experiment' }));
    let dialog = await screen.findByRole('dialog', { name: 'New experiment' });
    await user.type(within(dialog).getByLabelText('Name'), 'Busy flag');
    await user.type(within(dialog).getByLabelText('Where schools see it'), 'Analytics');
    await user.selectOptions(within(dialog).getByLabelText('Feature flag'), 'advanced_reports');
    await user.click(within(dialog).getByRole('button', { name: 'Start experiment' }));
    expect(await within(dialog).findByText('Another running experiment already uses this flag. Stop it first.')).toBeInTheDocument();

    // certificates is on for every school: annotated, explained inline, and Start is disabled.
    expect(within(dialog).getByRole('option', { name: /certificates \(already live\)/ })).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Feature flag'), 'certificates');
    expect(within(dialog).getByText(/already on for every school/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Start experiment' })).toBeDisabled();
    // Flags nothing reads are listed as disabled, with the reason.
    expect(within(dialog).getByRole('option', { name: /multi_currency \(gates nothing yet\)/ })).toBeDisabled();
    expect(within(dialog).getByRole('option', { name: /site_builder_v2 \(gates nothing yet\)/ })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    // Stopping the advanced-reports experiment frees its (still off) flag for a new experiment.
    const row = within(table).getByRole('row', { name: /Advanced reports/ });
    await user.click(within(row).getByRole('button', { name: 'Stop' }));
    await user.click(within(row).getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() => expect(experiments.find('ex_advanced_reports')!.status).toBe('stopped'));

    await user.click(screen.getByRole('button', { name: 'New experiment' }));
    dialog = await screen.findByRole('dialog', { name: 'New experiment' });
    await user.type(within(dialog).getByLabelText('Name'), 'Reports again');
    await user.type(within(dialog).getByLabelText('Where schools see it'), 'Analytics');
    await user.selectOptions(within(dialog).getByLabelText('Feature flag'), 'advanced_reports');
    await user.click(within(dialog).getByRole('button', { name: 'Start experiment' }));
    await waitFor(() => expect(experiments.where((e) => e.name === 'Reports again')).toHaveLength(1));
    expect(audit.where((a) => a.action.startsWith('Started experiment "Reports again" on advanced_reports'))).toHaveLength(1);

    await user.click(await screen.findByRole('button', { name: 'Open Reports again' }));
    const drawer = await screen.findByRole('dialog', { name: 'Reports again' });
    expect(await within(drawer).findByText('Control (flag off)')).toBeInTheDocument();
  });

  it('refuses an experiment on a flag that is already live or gates nothing (server rules)', async () => {
    signInAs('Owner');
    expect(flags.find('certificates')).toMatchObject({ enabled: true, rollout: 'All tenants' });
    const body = { name: 'Live', surface: 'Courses', flagKey: 'certificates', metric: 'trial_converted', allocationPct: 10 };
    await expect(api.post('/analytics/experiments', body)).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 422 && e.code === 'experiment_flag_already_live',
    );
    flags.update('certificates', { rollout: 'Beta list' });
    await expect(api.post('/analytics/experiments', body)).resolves.toBeTruthy();
    // A flag nothing reads compares two identical groups, whatever its state.
    await expect(api.post('/analytics/experiments', { ...body, flagKey: 'multi_currency' })).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 422 && e.code === 'experiment_flag_no_effect',
    );
  });

  it('deletes a finished experiment after confirming, never a running one', async () => {
    signInAs('Owner');
    const { user } = renderApp('/analytics/experiments');
    const table = await screen.findByRole('table', { name: 'Experiments' });
    const running = within(table).getByRole('row', { name: /New site builder/ });
    expect(within(running).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await expect(api.delete('/analytics/experiments/ex_site_builder')).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 409);

    const row = within(table).getByRole('row', { name: /Checkout trust badges/ });
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(experiments.find('ex_trust_badges')).toBeDefined();
    await user.click(within(row).getByRole('button', { name: 'Confirm delete' }));
    expect(await screen.findByText('Checkout trust badges deleted with its results')).toBeInTheDocument();
    expect(experiments.find('ex_trust_badges')).toBeUndefined();
    expect(
      audit.where((a) => a.action === 'Deleted experiment "Checkout trust badges" and its results' && a.category === 'Flags'),
    ).toHaveLength(1);
    await waitFor(() => expect(within(table).queryByRole('row', { name: /Checkout trust badges/ })).not.toBeInTheDocument());
  });

  it('hides promote and stop from read-only staff', async () => {
    signInAs('Finance');
    renderApp('/analytics/experiments');
    expect(await screen.findByRole('table', { name: 'Experiments' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promote' })).not.toBeInTheDocument();
    await expect(api.post('/analytics/experiments/ex_site_builder/promote')).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 403,
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await expect(api.delete('/analytics/experiments/ex_trust_badges')).rejects.toSatisfy((e) => e instanceof ApiError && e.status === 403);
  });
});
