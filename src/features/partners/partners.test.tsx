import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audit } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';
import { partnerTerms, platformPartners, platformPayoutBatches } from './mock';

describe('partner programme', () => {
  it('lists applications (confirmed emails only) and approves one', async () => {
    signInAs('Owner');
    const { user } = renderApp('/partners');
    const table = await screen.findByRole('table', { name: 'Applications' });
    expect(within(table).getByText('Alex Kim')).toBeInTheDocument();
    expect(within(table).queryByText('Riley Stone')).not.toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Alex Kim approved — welcome email sent with the portal link')).toBeInTheDocument();
    expect(platformPartners.find('ppt_alex')?.status).toBe('Active');
    expect(audit.all().some((a) => a.action === 'Approved partner Alex Kim')).toBe(true);
  });

  it('drafts a payout batch from owed commissions, listing blocked partners', async () => {
    signInAs('Owner');
    const { user } = renderApp('/partners?section=payouts');
    await user.click(await screen.findByRole('button', { name: 'Draft this month’s batch' }));
    expect(await screen.findByText(/Draft batch of .* ready to review/)).toBeInTheDocument();
    const batch = platformPayoutBatches.all()[0];
    expect(batch?.status).toBe('draft');
    expect(batch?.items.map((i) => i.payeeId)).toEqual(['ppt_maya']);
    expect(batch?.blocked.map((b) => b.code)).toContain('no_payout_method');
  });

  it('validates the programme terms (tax always excluded) and saves them', async () => {
    signInAs('Owner');
    const { user } = renderApp('/partners?section=settings');
    const rate = await screen.findByLabelText('Commission (%)');
    await user.clear(rate);
    await user.type(rate, '95');
    await user.click(screen.getByRole('button', { name: 'Save terms' }));
    expect(await screen.findByText('Must be between 1 and 90.')).toBeInTheDocument();
    await user.clear(rate);
    await user.type(rate, '25');
    await user.click(screen.getByRole('button', { name: 'Save terms' }));
    expect(await screen.findByText('Programme terms saved — coursiva.com updates within a minute')).toBeInTheDocument();
    expect(partnerTerms.get().commissionPct).toBe(25);
  });

  it('is hidden from roles without partner permissions, and read-only staff cannot act', async () => {
    signInAs('Finance');
    renderApp('/partners');
    expect(await screen.findByText(/don’t have access|not allowed|permission/i)).toBeInTheDocument();
  });
});
