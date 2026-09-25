import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { audit, flags, platformStatus } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { aiSettings, experiments, jobQueues } from './mock';

describe('growth analytics', () => {
  it('shows tenant-derived revenue, funnel and onboarding figures', async () => {
    signInAs('Owner');
    renderApp('/analytics/growth');
    // 9 paying tenants, $4,491 paying MRR → $499 per tenant (same as /tenants/summary arpa).
    expect(await screen.findByText('$499/mo')).toBeInTheDocument();
    expect(screen.getByText('9 paying tenants')).toBeInTheDocument();
    const funnel = screen.getByRole('table', { name: /Acquisition funnel/ });
    expect(within(funnel).getByRole('row', { name: /Visitors 325/ })).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: /Cohort retention/ })).getAllByRole('row')).toHaveLength(7);
    const stuck = screen.getByRole('heading', { name: 'Stuck in onboarding' }).closest('section')!;
    expect(within(stuck).getByText('Ledger Finance Academy')).toBeInTheDocument();
    expect(within(stuck).getByText(/Stuck at “First sale”/)).toBeInTheDocument();
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
    expect(within(devpath).getByText('Video storage overage · +$114')).toBeInTheDocument();
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
    // DevPath (Scale, 1,500k allowance) used 1,980k: cost 1980 × $0.42 = $832, overage 480k × $0.60.
    const devpath = within(t).getByRole('row', { name: /DevPath Bootcamp/ });
    expect(within(devpath).getByText('1,980k of 1,500k')).toBeInTheDocument();
    expect(within(devpath).getByText('$832')).toBeInTheDocument();
    expect(within(devpath).getByText('+$288 billed')).toBeInTheDocument();
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
    const row = within(await screen.findByRole('table', { name: 'Experiments' })).getByRole('row', { name: /Multi-currency/ });
    await user.click(within(row).getByRole('button', { name: 'Stop' }));
    await user.click(within(row).getByRole('button', { name: 'Confirm stop' }));
    await waitFor(() => expect(experiments.find('ex_multi_currency')!.status).toBe('stopped'));
  });

  it('hides promote and stop from read-only staff', async () => {
    signInAs('Finance');
    renderApp('/analytics/experiments');
    expect(await screen.findByRole('table', { name: 'Experiments' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promote' })).not.toBeInTheDocument();
    await expect(api.post('/analytics/experiments/ex_site_builder/promote')).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 403,
    );
  });
});
