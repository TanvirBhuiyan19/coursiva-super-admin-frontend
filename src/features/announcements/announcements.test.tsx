import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audit } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';

const history = () => screen.findByRole('list', { name: 'Sent announcements' });

describe('announcements', () => {
  it('shows the history newest first', async () => {
    signInAs('Owner');
    renderApp('/announcements');
    const items = within(await history()).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Checkout maintenance window');
    expect(items[2]).toHaveTextContent('New EU data residency option now in beta');
  });

  it('validates the message before sending', async () => {
    signInAs('Owner');
    const { user } = renderApp('/announcements');
    await history();
    await user.click(screen.getByRole('button', { name: 'Send announcement' }));
    expect(await screen.findByText('Write the announcement first.')).toBeInTheDocument();
    const message = screen.getByLabelText('Message');
    await user.click(message);
    await user.paste('x'.repeat(501));
    expect(await screen.findByText('Keep announcements under 500 characters.')).toBeInTheDocument();
    expect(audit.all().some((a) => a.action.startsWith('Broadcast to'))).toBe(false);
  });

  it('sends to an audience and channel, persists it, and audits it', async () => {
    signInAs('Owner');
    const { user } = renderApp('/announcements');
    await history();
    await user.type(screen.getByLabelText('Message'), 'Scale plans now include SSO');
    await user.selectOptions(screen.getByLabelText('Audience'), 'Scale plan');
    await user.click(screen.getByRole('radio', { name: 'Email' }));
    await user.click(screen.getByRole('button', { name: 'Send announcement' }));
    expect(await screen.findByText(/Announcement sent to scale plan — 3 tenants via email/)).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Sent announcements' })).getAllByRole('listitem')).toHaveLength(4));
    const first = within(screen.getByRole('list', { name: 'Sent announcements' })).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Scale plans now include SSO');
    expect(first).toHaveTextContent('Scale plan');
    expect(first).toHaveTextContent('Email');
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(audit.all().some((a) => a.action === 'Broadcast to Scale plan: "Scale plans now include SSO"' && a.category === 'Tenants')).toBe(
      true,
    );
  });

  it('is not available without announcements.send', async () => {
    signInAs('Support');
    renderApp('/announcements');
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send announcement' })).not.toBeInTheDocument();
  });
});
