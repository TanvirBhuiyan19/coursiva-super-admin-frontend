import { Link } from 'react-router-dom';
import { Badge, Card, Chip } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useImpersonate } from '@/features/tenants/api';
import { formatDate, healthTone, money, planTone, toneFg } from '@/lib/format';
import { useUi } from '@/store/ui';
import { useSupportOptions, useUpdateTicket } from '../api';
import { statusTone } from '../sla';
import type { TicketDetail } from '../types';

const eyebrow = { fontSize: 10.5, marginBottom: 8 } as const;

export function TenantPanel({ ticket: t }: { ticket: TicketDetail }) {
  const can = useCan();
  const ctx = t.tenantContext;
  const setUi = useUi((s) => s.set);
  const impersonate = useImpersonate(ctx.id);
  const update = useUpdateTicket(t.id);
  const options = useSupportOptions();
  const manage = can('support.manage');
  const tags = [...new Set([...(options.data?.tags ?? []), ...t.tags])];

  return (
    <div className="stack" style={{ gap: 14, flex: '1 1 260px', minWidth: 0 }}>
      <section className="card" aria-labelledby="support-tenant" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 id="support-tenant" className="display min0 ellipsis" style={{ fontWeight: 700, fontSize: 14, flex: 1, margin: 0 }}>
            {ctx.name}
          </h2>
          <Badge tone={planTone(ctx.plan)} xs>
            {ctx.plan}
          </Badge>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
          {ctx.mrr ? `${money(ctx.mrr)} MRR` : 'No MRR'} · {ctx.ownerName} ·{' '}
          <span style={{ color: toneFg(healthTone(ctx.health)) }}>{ctx.health}</span>
        </div>
        <dl className="stack" style={{ gap: 8, marginTop: 12, marginBottom: 0 }}>
          {ctx.signals.map((s) => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <dt className="muted">{s.label}</dt>
              <dd style={{ margin: 0, fontWeight: 700, textAlign: 'right', color: s.tone === 'flat' ? 'var(--tx2)' : toneFg(s.tone) }}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="hstack wrap" style={{ marginTop: 14 }}>
          <Link to={`/tenants/${ctx.id}`} className="btn btn--sm">
            Open tenant
          </Link>
          {can('tenants.impersonate') && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={impersonate.isPending}
              onClick={() => impersonate.mutate(undefined, { onSuccess: () => setUi({ impersonating: ctx.id }) })}
            >
              Impersonate
            </button>
          )}
        </div>
      </section>

      <Card
        title={
          <span className="eyebrow" style={eyebrow}>
            Tags
          </span>
        }
        style={{ padding: '16px 18px' }}
      >
        <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label="Ticket tags">
          {tags.map((tag) => {
            const on = t.tags.includes(tag);
            return (
              <Chip
                key={tag}
                size="xs"
                accent
                on={on}
                disabled={!manage}
                onClick={() => update.mutate({ tags: on ? t.tags.filter((x) => x !== tag) : [...t.tags, tag] })}
              >
                {tag}
              </Chip>
            );
          })}
        </div>
      </Card>

      <Card
        title={
          <span className="eyebrow" style={eyebrow}>
            Past tickets
          </span>
        }
        style={{ padding: '16px 18px' }}
      >
        {ctx.pastTickets.length === 0 ? (
          <div className="note">No other tickets from {ctx.name}.</div>
        ) : (
          <ul className="plain-list">
            {ctx.pastTickets.map((p) => (
              <li key={p.number} className="row" style={{ gap: 10, padding: '9px 0', fontSize: 12.5, alignItems: 'flex-start' }}>
                <div className="min0" style={{ flex: 1 }}>
                  {p.id ? (
                    <Link to={`/support?view=all&ticket=${p.id}`} className="row-link ellipsis">
                      {p.subject}
                    </Link>
                  ) : (
                    <div className="ellipsis" style={{ fontWeight: 600 }}>
                      {p.subject}
                    </div>
                  )}
                  <div className="faint" style={{ fontSize: 11 }}>
                    #{p.number} · <span style={{ color: toneFg(statusTone(p.status)) }}>{p.status}</span> · {formatDate(p.createdAt)}
                  </div>
                </div>
                {p.csat != null && (
                  <span className="muted nowrap" style={{ fontWeight: 700 }} aria-label={`CSAT ${p.csat} out of 5`}>
                    {p.csat} ★
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
