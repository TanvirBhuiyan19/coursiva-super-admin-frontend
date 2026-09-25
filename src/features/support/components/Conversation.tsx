import { useState, type KeyboardEvent } from 'react';
import { Badge, Select, Spinner, Textarea } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDateTime, shortDuration, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { usePostTicketMessage, useSupportOptions, useTicketAction, useUpdateTicket } from '../api';
import { slaFg, slaLabel, slaTone } from '../sla';
import { TICKET_STATUSES, type TicketDetail, type TicketMessage, type TicketStatus } from '../types';

const CANNED_PLACEHOLDER = '__canned';
const selectStyle = { width: 'auto', fontSize: 12.5, padding: '8px 11px' } as const;

const fieldError = (err: unknown) =>
  err instanceof ApiError && err.isValidation ? (Object.values(err.fieldErrors)[0]?.[0] ?? err.message) : errorMessage(err);

/** Ctrl/⌘ + Enter submits a multi-line composer. */
const submitOnModEnter = (send: () => void) => (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    send();
  }
};

function Message({ m }: { m: TicketMessage }) {
  const meta = (
    <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
      {m.authorName} · <time dateTime={m.createdAt}>{timeAgo(m.createdAt)}</time>
    </div>
  );
  if (m.internal)
    return (
      <li data-internal="true" aria-label={`Internal note by ${m.authorName}`}>
        <div className="callout callout--warn" style={{ display: 'block', padding: '9px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
          <b>Internal note</b> · <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
          {meta}
        </div>
      </li>
    );
  const me = m.author === 'staff';
  return (
    <li style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: me ? 'var(--ac)' : 'var(--bd2)',
          color: me ? 'var(--onAc)' : 'var(--tx)',
          fontSize: 13.5,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {m.body}
      </div>
      {meta}
    </li>
  );
}

export function Conversation({ ticket: t }: { ticket: TicketDetail }) {
  const can = useCan();
  const manage = can('support.manage');
  const options = useSupportOptions();
  const update = useUpdateTicket(t.id);
  const action = useTicketAction(t.id);
  const reply = usePostTicketMessage(t.id);
  const note = usePostTicketMessage(t.id);
  const [draft, setDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const tone = slaTone(t.slaState);
  const busy = update.isPending || action.isPending;

  const assignees = options.data?.assignees ?? (t.assignee ? [t.assignee] : []);
  const assigneeOptions = [['', 'Unassigned'] as const, ...assignees.map((a) => [a.id, a.name] as const)];

  const setStatus = (status: TicketStatus, message: string) => update.mutate({ status }, { onSuccess: () => toast(message) });

  const send = () => {
    const body = draft.trim();
    if (!body || reply.isPending) return;
    setReplyError(null);
    reply.mutate(
      { body, internal: false },
      {
        onSuccess: () => {
          setDraft('');
          toast(`Reply sent to ${t.requesterName}`);
        },
        onError: (err) => setReplyError(fieldError(err)),
      },
    );
  };

  const saveNote = () => {
    const body = noteDraft.trim();
    if (!body || note.isPending) return;
    setNoteError(null);
    note.mutate(
      { body, internal: true },
      {
        onSuccess: () => {
          setNoteDraft('');
          toast('Internal note saved — only staff can see it');
        },
        onError: (err) => setNoteError(fieldError(err)),
      },
    );
  };

  return (
    <section
      className="card card--flush stack"
      aria-labelledby="ticket-subject"
      style={{ flex: '2.2 1 440px', minWidth: 0, minHeight: 560, overflow: 'visible', padding: 0 }}
    >
      <div className="hstack wrap" style={{ gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--bd2)' }}>
        <div className="min0" style={{ flex: '1 1 200px' }}>
          <h2 id="ticket-subject" style={{ fontWeight: 700, fontSize: 14.5, margin: 0 }}>
            {t.subject}
          </h2>
          <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>
            #{t.number} · {t.tenant.name} · {t.requesterName} · {t.channel} · opened{' '}
            <time dateTime={t.createdAt}>{formatDateTime(t.createdAt)}</time> · first-reply target {shortDuration(t.slaTargetMinutes)}
          </div>
        </div>
        <Select
          label="Assignee"
          value={t.assignee?.id ?? ''}
          options={assigneeOptions}
          style={selectStyle}
          disabled={!manage || busy}
          onChange={(assigneeId) =>
            update.mutate(
              { assigneeId: assigneeId || null },
              {
                onSuccess: (d) =>
                  toast(d.assignee ? `Ticket #${d.number} assigned to ${d.assignee.name}` : `Ticket #${d.number} unassigned`),
              },
            )
          }
        />
        <Select
          label="Ticket status"
          value={t.status}
          options={TICKET_STATUSES}
          style={selectStyle}
          disabled={!manage || busy}
          onChange={(v) => setStatus(v, `Ticket #${t.number} marked ${v.toLowerCase()}`)}
        />
      </div>

      <div className="hstack wrap" style={{ gap: 10, padding: '9px 18px', borderBottom: '1px solid var(--bd2)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: slaFg(tone) }}>
          <span aria-hidden="true">⏱ </span>
          {slaLabel(t)}
        </span>
        <div className="spacer" />
        {t.escalated && (
          <Badge tone="bad" pill>
            Escalated to engineering
          </Badge>
        )}
        {manage && (
          <>
            {t.status === 'Open' && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() => setStatus('Pending', `Snoozed ticket #${t.number} — moved to Pending, the SLA clock pauses`)}
              >
                Snooze
              </button>
            )}
            {!t.escalated && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() =>
                  action.mutate('escalate', {
                    onSuccess: () => toast(`Escalated ticket #${t.number} to engineering — the on-call engineer is paged`),
                  })
                }
              >
                Escalate
              </button>
            )}
            {t.status !== 'Resolved' && (
              <button
                type="button"
                className="btn btn--sm btn--outline-accent"
                disabled={busy}
                onClick={() => action.mutate('resolve', { onSuccess: () => toast(`Resolved — CSAT survey sent to ${t.requesterName}`) })}
              >
                Resolve &amp; send CSAT
              </button>
            )}
          </>
        )}
      </div>

      <ol className="stack plain-list" aria-label="Conversation" style={{ flex: 1, padding: 18, gap: 12 }}>
        {t.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </ol>

      {manage ? (
        <>
          <div style={{ margin: '0 18px 12px' }}>
            <div className="hstack">
              <input
                className="input"
                style={{ flex: 1, minWidth: 0, fontSize: 12.5, borderStyle: 'dashed', background: 'var(--pg2)' }}
                value={noteDraft}
                placeholder="Internal note — never visible to the tenant…"
                aria-label="Internal note"
                aria-invalid={noteError ? true : undefined}
                maxLength={5000}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveNote();
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12.5 }}
                disabled={!noteDraft.trim() || note.isPending}
                onClick={saveNote}
              >
                {note.isPending && <Spinner />} Add note
              </button>
            </div>
            {noteError && (
              <div className="field-error" role="alert">
                {noteError}
              </div>
            )}
          </div>
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--bd2)' }}>
            <Textarea
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
              value={draft}
              placeholder="Reply as Coursiva support…"
              aria-label="Reply"
              aria-invalid={replyError ? true : undefined}
              maxLength={5000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={submitOnModEnter(send)}
            />
            {replyError && (
              <div className="field-error" role="alert">
                {replyError}
              </div>
            )}
            <div className="hstack wrap" style={{ gap: 10, marginTop: 10 }}>
              <Select
                label="Canned replies"
                value={CANNED_PLACEHOLDER}
                options={[
                  [CANNED_PLACEHOLDER, 'Canned replies…'] as const,
                  ...(options.data?.cannedReplies ?? []).map((c) => [c.id, c.title] as const),
                ]}
                style={{ width: 'auto', maxWidth: 190, fontSize: 12.5, fontWeight: 600, padding: '8px 11px' }}
                onChange={(v) => {
                  const c = options.data?.cannedReplies.find((x) => x.id === v);
                  if (c) setDraft(c.body);
                }}
              />
              <span className="t-xs faint">Ctrl + Enter to send · the tenant sees this reply</span>
              <div className="spacer" />
              <button type="button" className="btn btn--primary" disabled={!draft.trim() || reply.isPending} onClick={send}>
                {reply.isPending && <Spinner />} Send
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="note" style={{ padding: '14px 18px', borderTop: '1px solid var(--bd2)' }}>
          You have read-only access to support. Ask a platform owner for “Handle tickets” to reply.
        </div>
      )}
    </section>
  );
}
