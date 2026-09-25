import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api/client';
import { audit, staff, tickets } from '@/mocks/collections';
import { renderApp, signInAs } from '@/test/utils';

const list = () => screen.findByRole('region', { name: 'Tickets' });
const conversation = () => screen.findByRole('list', { name: 'Conversation' });

describe('support inbox', () => {
  it('lists open tickets with server-computed SLA and view counts', async () => {
    signInAs('Owner');
    renderApp('/support');
    const inbox = await list();
    await waitFor(() => expect(within(inbox).getAllByRole('listitem')).toHaveLength(3));
    // #1040 is Medium, 5h old and unanswered → breached its 4h first-reply target, and floats to the top.
    const first = within(inbox).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Webhook deliveries delayed');
    expect(first).toHaveTextContent(/First reply 1h late/);
    expect(await screen.findByRole('button', { name: 'Breaching SLA · 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Everything · 4' })).toBeInTheDocument();
    // The first ticket opens by default.
    expect(await screen.findByRole('heading', { name: 'Webhook deliveries delayed ~10 min' })).toBeInTheDocument();
  });

  it('filters by view and search, keeping both in the URL', async () => {
    signInAs('Owner');
    const { user, router } = renderApp('/support');
    await user.click(await screen.findByRole('button', { name: 'Resolved · 1' }));
    await waitFor(() => expect(router.state.location.search).toContain('view=resolved'));
    const inbox = await list();
    await waitFor(() => expect(within(inbox).getAllByRole('listitem')).toHaveLength(1));
    expect(within(inbox).getByText('Feature request: cohort analytics')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Everything · 4' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'kodo');
    await waitFor(() => expect(router.state.location.search).toContain('q=kodo'));
    await waitFor(() => expect(within(inbox).getAllByRole('listitem')).toHaveLength(1));
    expect(within(inbox).getByText('How do we enable SSO for our team?')).toBeInTheDocument();
  });

  it('deep-links to a ticket and shows its tenant context', async () => {
    signInAs('Owner');
    renderApp('/support?ticket=tk_1041');
    expect(await screen.findByRole('heading', { name: 'Card keeps failing on renewal' })).toBeInTheDocument();
    const tenant = screen.getByRole('region', { name: 'Bloom Floristry Courses' });
    expect(within(tenant).getByText(/\$99 MRR/)).toBeInTheDocument();
    expect(within(tenant).getByRole('link', { name: 'Open tenant' })).toHaveAttribute('href', '/tenants/tn_bloom');
    expect(screen.getByText('Renewal invoice failed')).toBeInTheDocument();
  });

  it('sends a reply that persists and clears the composer', async () => {
    signInAs('Owner');
    const { user } = renderApp('/support?ticket=tk_1040');
    await screen.findByRole('heading', { name: 'Webhook deliveries delayed ~10 min' });
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    await user.type(reply, 'We are replaying the queue now.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(tickets.find('tk_1040')!.messages).toHaveLength(2));
    expect(tickets.find('tk_1040')!.messages[1]).toMatchObject({
      author: 'staff',
      authorName: 'Sam Ortega',
      body: 'We are replaying the queue now.',
      internal: false,
    });
    await waitFor(() => expect(reply).toHaveValue(''));
    const thread = await conversation();
    expect(within(thread).getByText('We are replaying the queue now.')).toBeInTheDocument();
    // The first reply stops the first-reply SLA clock.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Breaching SLA · 0' })).toBeInTheDocument());
    expect(audit.all().some((a) => a.action === 'Replied to ticket #1040 (DevPath Bootcamp)' && a.category === 'Tenants')).toBe(true);
  });

  it('saves internal notes flagged as internal and styles them apart', async () => {
    signInAs('Owner');
    const { user } = renderApp('/support?ticket=tk_1041');
    await screen.findByRole('heading', { name: 'Card keeps failing on renewal' });
    await user.type(screen.getByRole('textbox', { name: 'Internal note' }), 'Bank is Garanti — known 3DS issue{Enter}');
    await waitFor(() => expect(tickets.find('tk_1041')!.messages).toHaveLength(3));
    expect(tickets.find('tk_1041')!.messages[2]).toMatchObject({ internal: true, body: 'Bank is Garanti — known 3DS issue' });
    const note = await screen.findByRole('listitem', { name: 'Internal note by Sam Ortega' });
    expect(note).toHaveAttribute('data-internal', 'true');
    expect(within(note).getByText('Internal note')).toBeInTheDocument();
    // An internal note is not a reply: the ticket stays with its public first reply.
    expect(audit.all().some((a) => a.action === 'Added an internal note to ticket #1041 (Bloom Floristry Courses)')).toBe(true);
  });

  it('resolves a ticket and updates the open-ticket badge', async () => {
    signInAs('Owner');
    const { user } = renderApp('/support?ticket=tk_1041');
    expect(await screen.findByLabelText('3 open tickets')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Card keeps failing on renewal' });
    await user.click(screen.getByRole('button', { name: 'Resolve & send CSAT' }));
    expect(await screen.findByText('Resolved — CSAT survey sent to Elif Kaya')).toBeInTheDocument();
    expect(tickets.find('tk_1041')!.status).toBe('Resolved');
    expect(await screen.findByLabelText('2 open tickets')).toBeInTheDocument();
  });

  it('assigns, escalates and tags a ticket', async () => {
    signInAs('Owner');
    const { user } = renderApp('/support?ticket=tk_1040');
    await screen.findByRole('heading', { name: 'Webhook deliveries delayed ~10 min' });
    await screen.findByRole('option', { name: 'Lee Chen' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assignee' }), 'Lee Chen');
    await waitFor(() => expect(tickets.find('tk_1040')!.assigneeId).toBe('st_lee'));
    await user.click(screen.getByRole('button', { name: 'Escalate' }));
    await waitFor(() => expect(tickets.find('tk_1040')!.escalated).toBe(true));
    await user.click(within(screen.getByRole('group', { name: 'Ticket tags' })).getByRole('button', { name: 'Bug' }));
    await waitFor(() => expect(tickets.find('tk_1040')!.tags).toEqual(['Bug']));
    await user.click(screen.getByRole('button', { name: 'Snooze' }));
    await waitFor(() => expect(tickets.find('tk_1040')!.status).toBe('Pending'));
    const actions = audit.all().map((a) => a.action);
    expect(actions).toContain('Assigned ticket #1040 to Lee Chen');
    expect(actions).toContain('Escalated ticket #1040 to engineering');
    expect(actions).toContain('Changed ticket #1040 from Open to Pending');
  });

  it('lets a read-only role read tickets but not reply', async () => {
    staff.update('st_dana', { status: 'Active' });
    signInAs('Read-only');
    renderApp('/support?ticket=tk_1041');
    await screen.findByRole('heading', { name: 'Card keeps failing on renewal' });
    const inbox = await list();
    await waitFor(() => expect(within(inbox).getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Internal note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve & send CSAT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Impersonate' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ticket status' })).toBeDisabled();
    expect(screen.getByText(/read-only access to support/)).toBeInTheDocument();
  });

  it('rejects replies from a role without support.manage at the API', async () => {
    signInAs('Support');
    await expect(api.post('/support/tickets/tk_1041/messages', { body: 'hi', internal: false })).resolves.toBeTruthy();
    staff.update('st_dana', { status: 'Active' });
    signInAs('Read-only');
    await expect(api.post('/support/tickets/tk_1041/messages', { body: 'hi', internal: false })).rejects.toMatchObject({ status: 403 });
    await expect(api.post('/support/tickets/tk_1041/messages', { body: '  ', internal: false })).rejects.toMatchObject({ status: 403 });
    expect(tickets.find('tk_1041')!.messages).toHaveLength(3);
  });

  it('validates an empty reply at the API', async () => {
    signInAs('Owner');
    await expect(api.post('/support/tickets/tk_1041/messages', { body: '   ', internal: false })).rejects.toMatchObject({ status: 422 });
  });
});
