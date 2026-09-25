import { Link } from 'react-router-dom';
import { Badge, Card, Chip } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { useImpersonate } from '@/features/tenants/api';
import { formatDate, healthTone, money, planTone, toneFg } from '@/lib/format';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useUi } from '@/store/ui';
import { useSupportOptions, useUpdateTicket } from '../api';
import { useT } from '../i18n';
import { statusTone } from '../sla';
import type { TicketDetail } from '../types';

const eyebrow = { fontSize: 10.5, marginBottom: 8 } as const;

export function TenantPanel({ ticket: tk }: { ticket: TicketDetail }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const ctx = tk.tenantContext;
  const setUi = useUi((s) => s.set);
  const impersonate = useImpersonate(ctx.id);
  const update = useUpdateTicket(tk.id);
  const options = useSupportOptions();
  const manage = can('support.manage');
  const tags = [...new Set([...(options.data?.tags ?? []), ...tk.tags])];

  return (
    <div className="stack" style={{ gap: 14, flex: '1 1 260px', minWidth: 0 }}>
      <section className="card" aria-labelledby="support-tenant" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 id="support-tenant" className="display min0 ellipsis" style={{ fontWeight: 700, fontSize: 14, flex: 1, margin: 0 }}>
            {ctx.name}
          </h2>
          <Badge tone={planTone(ctx.plan)} xs>
            {tc(`enums.plan.${ctx.plan}`)}
          </Badge>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
          {ctx.mrr ? t('tenant.mrr', { amount: money(ctx.mrr) }) : t('tenant.noMrr')} · {ctx.ownerName} ·{' '}
          <span style={{ color: toneFg(healthTone(ctx.health)) }}>{tc(`enums.tenantHealth.${ctx.health}`)}</span>
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
            {t('tenant.open')}
          </Link>
          {can('tenants.impersonate') && (
            <button
              type="button"
              className="btn btn--sm"
              disabled={impersonate.isPending}
              onClick={() => impersonate.mutate(undefined, { onSuccess: () => setUi({ impersonating: ctx.id }) })}
            >
              {t('tenant.impersonate')}
            </button>
          )}
        </div>
      </section>

      <Card
        title={
          <span className="eyebrow" style={eyebrow}>
            {t('tenant.tags')}
          </span>
        }
        style={{ padding: '16px 18px' }}
      >
        <div className="hstack wrap" style={{ gap: 6 }} role="group" aria-label={t('tenant.tagsLabel')}>
          {tags.map((tag) => {
            const on = tk.tags.includes(tag);
            return (
              <Chip
                key={tag}
                size="xs"
                accent
                on={on}
                disabled={!manage}
                onClick={() => update.mutate({ tags: on ? tk.tags.filter((x) => x !== tag) : [...tk.tags, tag] })}
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
            {t('tenant.pastTickets')}
          </span>
        }
        style={{ padding: '16px 18px' }}
      >
        {ctx.pastTickets.length === 0 ? (
          <div className="note">{t('tenant.noPastTickets', { name: ctx.name })}</div>
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
                    #{p.number} · <span style={{ color: toneFg(statusTone(p.status)) }}>{t(`status.${p.status}`)}</span> ·{' '}
                    {formatDate(p.createdAt)}
                  </div>
                </div>
                {p.csat != null && (
                  <span className="muted nowrap" style={{ fontWeight: 700 }} aria-label={t('tenant.csatLabel', { score: p.csat })}>
                    {t('tenant.csatStars', { score: p.csat })}
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
