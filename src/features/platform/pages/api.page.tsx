import { useState } from 'react';
import { Badge, Bar, Card, ConfirmButton, Empty, ErrorState, Screen, SkeletonRows, Spinner } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatMonth, plural, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useApiKeys, useRetryDelivery, useRevokeApiKey, useWebhooks } from '../api';
import { CreateApiKeyModal } from '../components/CreateApiKeyModal';
import type { ApiKey, WebhookDelivery } from '../types';

function KeyRow({ k, canManage }: { k: ApiKey; canManage: boolean }) {
  const revoke = useRevokeApiKey();
  return (
    <li className="row" style={{ gap: 14, padding: '12px 0' }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <div className="ellipsis" style={{ fontWeight: 600 }}>
          {k.name}
        </div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>
          {k.prefix}
        </div>
      </div>
      <Badge tone="flat" style={{ fontSize: 11 }}>
        {k.scope}
      </Badge>
      <span className="muted" style={{ flex: 1, fontSize: 12 }}>
        Created {formatMonth(k.createdAt)}
      </span>
      <span className="muted" style={{ width: 110, fontSize: 12 }}>
        {k.lastUsedAt ? `Used ${timeAgo(k.lastUsedAt)}` : 'Never used'}
      </span>
      <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end' }}>
        {k.revokedAt ? (
          <Badge tone="bad" style={{ fontSize: 11 }} title={`Revoked ${timeAgo(k.revokedAt)}`}>
            Revoked
          </Badge>
        ) : canManage ? (
          <ConfirmButton
            className="btn btn--sm btn--danger"
            style={{ padding: '5px 11px', fontWeight: 600 }}
            confirmLabel="Confirm revoke"
            pending={revoke.isPending}
            onConfirm={() => revoke.mutate(k.id, { onSuccess: () => toast(`${k.name} revoked — requests with ${k.prefix} now get 401`) })}
          >
            Revoke
          </ConfirmButton>
        ) : (
          <Badge tone="good" style={{ fontSize: 11 }}>
            Active
          </Badge>
        )}
      </div>
    </li>
  );
}

function DeliveryRow({ d, canManage }: { d: WebhookDelivery; canManage: boolean }) {
  const retry = useRetryDelivery();
  return (
    <li className="row" style={{ gap: 14, padding: '12px 0', fontSize: 12.5 }}>
      <span className="mono" style={{ fontSize: 12, width: 150, flexShrink: 0 }}>
        {d.event}
      </span>
      <span className="muted ellipsis mono" style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
        {d.url}
      </span>
      <span className="fg-bad" style={{ width: 190, fontWeight: 600, flexShrink: 0 }}>
        {d.error}
      </span>
      <span className="muted" style={{ width: 84, flexShrink: 0 }} title={`Last attempt ${timeAgo(d.lastAttemptAt)}`}>
        {plural(d.attempts, 'attempt')}
      </span>
      {canManage && (
        <button
          type="button"
          className="btn btn--sm btn--danger"
          style={{ padding: '5px 11px', fontWeight: 600 }}
          disabled={retry.isPending}
          aria-label={`Retry ${d.event} to ${d.url}`}
          onClick={() =>
            retry.mutate(d.id, {
              onSuccess: (r) =>
                r.delivered
                  ? toast(`${d.event} delivered — ${r.status ?? 200} OK`)
                  : toast(`${d.event} failed again — HTTP ${r.status ?? 'timeout'}. Ask the tenant to fix the endpoint.`, 'error'),
            })
          }
        >
          {retry.isPending && <Spinner />} Retry
        </button>
      )}
    </li>
  );
}

export default function ApiPage() {
  const can = useCan();
  const canManage = can('platform.manage');
  const keys = useApiKeys();
  const hooks = useWebhooks();
  const [creating, setCreating] = useState(false);

  return (
    <Screen max={1050} label="API and webhooks">
      <Card
        title="API keys"
        right={
          canManage && (
            <button
              type="button"
              className="btn btn--sm btn--outline-accent"
              style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}
              onClick={() => setCreating(true)}
            >
              Create key
            </button>
          )
        }
      >
        {keys.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : keys.error ? (
          <ErrorState compact error={keys.error} onRetry={() => void keys.refetch()} />
        ) : keys.data.length === 0 ? (
          <Empty>No platform API keys yet.</Empty>
        ) : (
          <div className="table-scroll">
            <ul className="plain-list" aria-label="API keys" style={{ minWidth: 640 }}>
              {keys.data.map((k) => (
                <KeyRow key={k.id} k={k} canManage={canManage} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Webhook endpoints">
        {hooks.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : hooks.error ? (
          <ErrorState compact error={hooks.error} onRetry={() => void hooks.refetch()} />
        ) : hooks.data.endpoints.length === 0 ? (
          <Empty>No webhook endpoints registered.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <ul className="plain-list" aria-label="Webhook endpoints" style={{ minWidth: 560 }}>
                {hooks.data.endpoints.map((e) => (
                  <li key={e.id} className="row" style={{ gap: 14, padding: '12px 0' }}>
                    <div className="min0" style={{ flex: 1 }}>
                      <div className="ellipsis mono" style={{ fontSize: 12.5 }}>
                        {e.url}
                      </div>
                      <div className="muted t-xs" style={{ marginTop: 2 }}>
                        {e.events}
                      </div>
                    </div>
                    <span className="hstack" style={{ width: 150, flexShrink: 0 }}>
                      <Bar
                        size="md"
                        value={e.successRate7d}
                        tone={e.status === 'Healthy' ? 'accent' : 'bad'}
                        label={`${e.url} delivery success ${e.successRate7d}%`}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{e.successRate7d}%</span>
                    </span>
                    <Badge tone={e.status === 'Healthy' ? 'good' : 'bad'} style={{ fontSize: 11 }}>
                      {e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>
              Delivery success rate, last 7 days.
            </div>
          </>
        )}
      </Card>

      <Card title="Failed deliveries · last 24 h">
        {hooks.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : hooks.error ? (
          <ErrorState compact error={hooks.error} onRetry={() => void hooks.refetch()} />
        ) : hooks.data.failedDeliveries.length ? (
          <div className="table-scroll">
            <ul className="plain-list" aria-label="Failed deliveries" style={{ minWidth: 700 }}>
              {hooks.data.failedDeliveries.map((d) => (
                <DeliveryRow key={d.id} d={d} canManage={canManage} />
              ))}
            </ul>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            No failed deliveries in the last 24 hours.
          </div>
        )}
      </Card>

      {creating && <CreateApiKeyModal onClose={() => setCreating(false)} />}
    </Screen>
  );
}
