import { useState } from 'react';
import { Badge, Bar, Card, ConfirmButton, Empty, ErrorState, Screen, SkeletonRows, Spinner } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { formatMonth, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useApiKeys, useRetryDelivery, useRevokeApiKey, useWebhooks } from '../api';
import { CreateApiKeyModal } from '../components/CreateApiKeyModal';
import { useT } from '../i18n';
import type { ApiKey, WebhookDelivery } from '../types';

function KeyRow({ k, canManage }: { k: ApiKey; canManage: boolean }) {
  const t = useT();
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
        {t(`enums.apiKeyScope.${k.scope}`)}
      </Badge>
      <span className="muted" style={{ flex: 1, fontSize: 12 }}>
        {t('apiKeys.created', { month: formatMonth(k.createdAt) })}
      </span>
      <span className="muted" style={{ width: 110, fontSize: 12 }}>
        {k.lastUsedAt ? t('apiKeys.used', { time: timeAgo(k.lastUsedAt) }) : t('apiKeys.neverUsed')}
      </span>
      <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end' }}>
        {k.revokedAt ? (
          <Badge tone="bad" style={{ fontSize: 11 }} title={t('apiKeys.revokedAt', { time: timeAgo(k.revokedAt) })}>
            {t('apiKeys.revoked')}
          </Badge>
        ) : canManage ? (
          <ConfirmButton
            className="btn btn--sm btn--danger"
            style={{ padding: '5px 11px', fontWeight: 600 }}
            confirmLabel={t('apiKeys.confirmRevoke')}
            pending={revoke.isPending}
            onConfirm={() => revoke.mutate(k.id, { onSuccess: () => toast(t('apiKeys.toastRevoked', { name: k.name, prefix: k.prefix })) })}
          >
            {t('apiKeys.revoke')}
          </ConfirmButton>
        ) : (
          <Badge tone="good" style={{ fontSize: 11 }}>
            {t('apiKeys.active')}
          </Badge>
        )}
      </div>
    </li>
  );
}

function DeliveryRow({ d, canManage }: { d: WebhookDelivery; canManage: boolean }) {
  const t = useT();
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
      <span className="muted" style={{ width: 84, flexShrink: 0 }} title={t('webhooks.lastAttempt', { time: timeAgo(d.lastAttemptAt) })}>
        {t('webhooks.attempts', { count: d.attempts })}
      </span>
      {canManage && (
        <button
          type="button"
          className="btn btn--sm btn--danger"
          style={{ padding: '5px 11px', fontWeight: 600 }}
          disabled={retry.isPending}
          aria-label={t('webhooks.retryLabel', { event: d.event, url: d.url })}
          onClick={() =>
            retry.mutate(d.id, {
              onSuccess: (r) =>
                r.delivered
                  ? toast(t('webhooks.delivered', { event: d.event, status: String(r.status ?? 200) }))
                  : toast(
                      t('webhooks.failedAgain', { event: d.event, status: r.status === null ? t('webhooks.timeout') : String(r.status) }),
                      'error',
                    ),
            })
          }
        >
          {retry.isPending && <Spinner />} {t('webhooks.retry')}
        </button>
      )}
    </li>
  );
}

export default function ApiPage() {
  const t = useT();
  const can = useCan();
  const canManage = can('platform.manage');
  const keys = useApiKeys();
  const hooks = useWebhooks();
  const [creating, setCreating] = useState(false);

  return (
    <Screen max={1050} label={t('apiKeys.screenLabel')}>
      <Card
        title={t('apiKeys.title')}
        right={
          canManage && (
            <button
              type="button"
              className="btn btn--sm btn--outline-accent"
              style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600 }}
              onClick={() => setCreating(true)}
            >
              {t('apiKeys.create')}
            </button>
          )
        }
      >
        {keys.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : keys.error ? (
          <ErrorState compact error={keys.error} onRetry={() => void keys.refetch()} />
        ) : keys.data.length === 0 ? (
          <Empty>{t('apiKeys.empty')}</Empty>
        ) : (
          <div className="table-scroll">
            <ul className="plain-list" aria-label={t('apiKeys.title')} style={{ minWidth: 640 }}>
              {keys.data.map((k) => (
                <KeyRow key={k.id} k={k} canManage={canManage} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title={t('webhooks.title')}>
        {hooks.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : hooks.error ? (
          <ErrorState compact error={hooks.error} onRetry={() => void hooks.refetch()} />
        ) : hooks.data.endpoints.length === 0 ? (
          <Empty>{t('webhooks.empty')}</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <ul className="plain-list" aria-label={t('webhooks.title')} style={{ minWidth: 560 }}>
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
                        label={t('webhooks.successLabel', { url: e.url, pct: e.successRate7d })}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{e.successRate7d}%</span>
                    </span>
                    <Badge tone={e.status === 'Healthy' ? 'good' : 'bad'} style={{ fontSize: 11 }}>
                      {t(`enums.webhookStatus.${e.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>
              {t('webhooks.successFootnote')}
            </div>
          </>
        )}
      </Card>

      <Card title={t('webhooks.failedTitle')}>
        {hooks.isPending ? (
          <SkeletonRows rows={3} h={24} />
        ) : hooks.error ? (
          <ErrorState compact error={hooks.error} onRetry={() => void hooks.refetch()} />
        ) : hooks.data.failedDeliveries.length ? (
          <div className="table-scroll">
            <ul className="plain-list" aria-label={t('webhooks.failedList')} style={{ minWidth: 700 }}>
              {hooks.data.failedDeliveries.map((d) => (
                <DeliveryRow key={d.id} d={d} canManage={canManage} />
              ))}
            </ul>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {t('webhooks.noFailed')}
          </div>
        )}
      </Card>

      {creating && <CreateApiKeyModal onClose={() => setCreating(false)} />}
    </Screen>
  );
}
