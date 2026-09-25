import { Link } from 'react-router-dom';
import { Badge, Bar, Card, ConfirmButton, Dot, Field, Select, Toggle, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { CommitNumberInput } from '@/components/ui';
import { money, num, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRotateDrmKeys, useUpdateDrm, useUpdateLiveRooms, useUpdateStorage } from '../api';
import { useT as useCommonT } from '@/lib/i18n/common';
import { useT } from '../i18n';
import {
  DRM_AVAILABILITY,
  DRM_SECURITY_LEVELS,
  RENDITION_LADDERS,
  WATERMARK_STYLES,
  type DrmSettings,
  type LiveRoomSettings,
  type LiveRoomUsage,
  type Stat,
  type StorageSettings,
} from '../types';
import { ConnectionCard } from './ConnectionCard';

const SUB_HEAD = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--tx4)',
} as const;
const CTRL = { padding: '8px 10px', fontSize: 12.5, width: '100%' } as const;
const AUTO_GRID = (min: number) =>
  ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 12, marginTop: 14 }) as const;
const DIVIDER = { marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--bd2)' } as const;

const opts = <V extends string>(values: readonly V[], label: (v: V) => string) => values.map((v) => [v, label(v)] as const);

function Stats({ items }: { items: Stat[] }) {
  return (
    <dl style={{ ...AUTO_GRID(170), gap: 10, marginBottom: 0 }}>
      {items.map((s) => (
        <div key={s.label} style={{ background: 'var(--bd2)', borderRadius: 10, padding: '11px 13px' }}>
          <dt className="muted" style={{ fontSize: 11 }}>
            {s.label}
          </dt>
          <dd className="display" style={{ fontSize: 17, fontWeight: 800, marginTop: 2, marginLeft: 0 }}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Live rooms ----------
function usageNote(t: ReturnType<typeof useT>, u: LiveRoomUsage) {
  if (u.status === 'byo') return t('liveRooms.byo');
  if (u.status === 'over') return t('liveRooms.over');
  return t('liveRooms.within');
}

export function LiveRoomsCard({ s }: { s: LiveRoomSettings }) {
  const t = useT();
  const tc = useCommonT();
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateLiveRooms();
  return (
    <Card title={t('liveRooms.title')}>
      <p className="muted t-sm" style={{ lineHeight: 1.55 }}>
        {t('liveRooms.intro')}
      </p>
      <div className="stack" style={{ marginTop: 8 }}>
        {s.policies.map((p) => (
          <ToggleRow
            key={p.key}
            label={p.label}
            sub={p.description}
            on={p.enabled}
            disabled={!manage}
            onChange={(enabled) =>
              update.mutate(
                { policies: [{ key: p.key, enabled }] },
                { onSuccess: () => toast(t(enabled ? 'liveRooms.policyOn' : 'liveRooms.policyOff', { label: p.label })) },
              )
            }
          />
        ))}
      </div>

      <h3 style={{ ...SUB_HEAD, marginTop: 16, marginBottom: 4 }}>{t('liveRooms.allowanceHeading')}</h3>
      <ul className="plain-list">
        {s.allowances.map((a) => (
          <li key={a.plan} className="row wrap" style={{ padding: '10px 0', fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, width: 80 }}>{tc(`enums.plan.${a.plan}`)}</span>
            {manage ? (
              <CommitNumberInput
                key={a.minutes}
                value={a.minutes}
                min={0}
                max={1_000_000}
                label={t('liveRooms.allowanceLabel', { plan: tc(`enums.plan.${a.plan}`) })}
                rangeMessage={t('liveRooms.allowanceRange')}
                style={{ width: 96, padding: '5px 8px', textAlign: 'right' }}
                onCommit={(minutes) =>
                  update.mutate(
                    { allowances: [{ plan: a.plan, minutes }] },
                    {
                      onSuccess: () =>
                        toast(
                          minutes
                            ? t('liveRooms.allowanceSaved', { plan: tc(`enums.plan.${a.plan}`), minutes })
                            : t('liveRooms.allowanceOff', { plan: tc(`enums.plan.${a.plan}`) }),
                        ),
                    },
                  )
                }
              />
            ) : (
              <span style={{ fontWeight: 600, width: 96, textAlign: 'right' }}>{num(a.minutes)}</span>
            )}
            <Badge tone={a.minutes > 0 ? 'good' : 'flat'}>{t('liveRooms.perMonth')}</Badge>
            <span className="muted" style={{ flex: 1, minWidth: 160 }}>
              {a.minutes > 0 ? t('liveRooms.included') : t('liveRooms.byoOnly')}
            </span>
          </li>
        ))}
      </ul>
      <p className="faint t-xs" style={{ marginTop: 8, lineHeight: 1.5 }}>
        {t('liveRooms.overage', { rate: s.overageRate, minutes: s.topUp.minutes, price: money(s.topUp.price) })}
      </p>

      <h3 style={{ ...SUB_HEAD, marginTop: 16, marginBottom: 4 }}>{t('liveRooms.usageHeading')}</h3>
      <ul className="plain-list">
        {s.usage.map((u) => {
          const pctUsed = u.allowanceMinutes ? Math.min(100, Math.round((u.usedMinutes / u.allowanceMinutes) * 100)) : 0;
          return (
            <li key={u.tenantId} className="row wrap" style={{ padding: '10px 0', fontSize: 12.5 }}>
              <span className="min0" style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
                <Link className="row-link" style={{ display: 'inline' }} to={`/tenants/${u.tenantId}`}>
                  {u.name}
                </Link>{' '}
                <span className="faint" style={{ fontWeight: 500 }}>
                  · {tc(`enums.plan.${u.plan}`)}
                </span>
              </span>
              <div style={{ width: 110 }}>
                <Bar
                  value={pctUsed}
                  tone={u.status === 'over' ? 'bad' : undefined}
                  label={t('liveRooms.usageLabel', { name: u.name, pct: pctUsed })}
                />
              </div>
              <span style={{ width: 120, textAlign: 'right', fontWeight: 700 }}>
                {u.status === 'byo' ? '—' : t('liveRooms.usageOf', { used: u.usedMinutes, allowance: u.allowanceMinutes })}
              </span>
              <span className={u.status === 'over' ? 'fg-bad' : 'muted'} style={{ width: 150, textAlign: 'right' }}>
                {usageNote(t, u)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="faint t-xs" style={{ marginTop: 10, lineHeight: 1.5 }}>
        {t('liveRooms.footnote')}
      </p>
    </Card>
  );
}

// ---------- DRM ----------
export function DrmCard({ s }: { s: DrmSettings }) {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateDrm();
  const rotate = useRotateDrmKeys();
  const active = s.providers.filter((p) => p.connected).map((p) => p.name);
  return (
    <Card
      title={t('drm.title')}
      right={
        <Badge pill tone="good">
          {t('drm.allProtected')}
        </Badge>
      }
    >
      <p className="muted t-sm">{t('drm.intro')}</p>
      <Stats items={s.stats} />
      <div className="stack" style={{ marginTop: 4 }}>
        {s.protections.map((p) => (
          <div key={p.key} className="row" style={{ gap: 14, padding: '13px 0' }}>
            <div className="min0" style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {p.description}
              </div>
            </div>
            {p.locked ? (
              <span className="faint nowrap" style={{ fontSize: 11, fontWeight: 700 }}>
                {t('drm.alwaysOn')}
              </span>
            ) : (
              <Toggle
                on={p.enabled}
                label={p.label}
                disabled={!manage}
                onChange={(enabled) =>
                  update.mutate(
                    { protections: [{ key: p.key, enabled }] },
                    { onSuccess: () => toast(t(enabled ? 'drm.protectionOn' : 'drm.protectionOff', { label: p.label })) },
                  )
                }
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ ...AUTO_GRID(220), gap: 14 }}>
        <Field label={t('drm.securityLevel')}>
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.securityLevel}
              options={opts(DRM_SECURITY_LEVELS, (v) => t(`drm.securityLevels.${v}`))}
              disabled={!manage}
              onChange={(securityLevel) =>
                update.mutate(
                  { securityLevel },
                  { onSuccess: () => toast(t('drm.securityLevelSet', { level: t(`drm.securityLevels.${securityLevel}`) })) },
                )
              }
            />
          )}
        </Field>
        <Field label={t('drm.watermarkStyle')}>
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.watermarkStyle}
              options={opts(WATERMARK_STYLES, (v) => t(`drm.watermarkStyles.${v}`))}
              disabled={!manage}
              onChange={(watermarkStyle) =>
                update.mutate(
                  { watermarkStyle },
                  { onSuccess: () => toast(t('drm.watermarkStyleSet', { style: t(`drm.watermarkStyles.${watermarkStyle}`) })) },
                )
              }
            />
          )}
        </Field>
        <Field label={t('drm.deviceLeases')}>
          {(fp) =>
            manage ? (
              <CommitNumberInput
                id={fp.id}
                key={s.deviceLeases}
                value={s.deviceLeases}
                min={1}
                max={20}
                label={t('drm.deviceLeases')}
                rangeMessage={t('drm.deviceLeasesRange')}
                style={{ ...CTRL, width: 90 }}
                onCommit={(deviceLeases) =>
                  update.mutate({ deviceLeases }, { onSuccess: () => toast(t('drm.deviceLeasesSet', { devices: deviceLeases })) })
                }
              />
            ) : (
              <div id={fp.id} style={{ fontWeight: 600 }}>
                {s.deviceLeases}
              </div>
            )
          }
        </Field>
        <Field label={t('drm.availableOn')}>
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.availableOn}
              options={opts(DRM_AVAILABILITY, (v) => t(`drm.availability.${v}`))}
              disabled={!manage}
              onChange={(availableOn) => update.mutate({ availableOn }, { onSuccess: () => toast(t(`drm.availableOnSet.${availableOn}`)) })}
            />
          )}
        </Field>
      </div>

      <div style={DIVIDER}>
        <div className="hstack" style={{ gap: 10 }}>
          <h3 style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>{t('drm.providers')}</h3>
          {active.length === 0 && (
            <Badge pill tone="bad">
              {t('drm.setupRequired')}
            </Badge>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
          {active.length ? t('drm.active', { names: active.join(' + ') }) : t('drm.noProvider')}
          {t('drm.keysNote')}
        </p>
        <div style={AUTO_GRID(240)}>
          {s.providers.map((p) => (
            <ConnectionCard
              key={p.key}
              kind="drm"
              badge
              connection={p}
              connectedToast={t('drm.providerConnected', { name: p.name })}
              disconnectedToast={t('drm.providerDisconnected', { name: p.name })}
            />
          ))}
        </div>
      </div>

      <div className="hstack wrap" style={{ ...DIVIDER, gap: 12, marginTop: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ fontWeight: 600, fontSize: 13 }}>{t('drm.signingKeys')}</h3>
          <div className="faint t-xs" style={{ marginTop: 1 }}>
            {t('drm.lastRotated', { ago: timeAgo(s.keysRotatedAt) })}
          </div>
        </div>
        {manage && (
          <ConfirmButton
            className="btn"
            confirmLabel={t('drm.confirmRotate')}
            pending={rotate.isPending}
            onConfirm={() => rotate.mutate(undefined, { onSuccess: () => toast(t('drm.rotated')) })}
          >
            {t('drm.rotate')}
          </ConfirmButton>
        )}
      </div>
    </Card>
  );
}

// ---------- Storage ----------
export function StorageCard({ s }: { s: StorageSettings }) {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateStorage();
  const healthy = s.pipeline.every((p) => p.healthy);
  return (
    <Card
      title={t('storage.title')}
      right={
        <Badge pill tone={healthy ? 'good' : 'warn'}>
          {healthy ? t('storage.healthy') : t('storage.degraded')}
        </Badge>
      }
    >
      <p className="muted t-sm">{t('storage.intro')}</p>
      <Stats items={s.stats} />
      <div style={AUTO_GRID(300)}>
        {s.backends.map((b) => (
          <ConnectionCard
            key={b.key}
            kind="storage"
            connection={b}
            connectedToast={t('storage.backendConnected', { name: b.name })}
            disconnectedToast={t('storage.backendDisconnected', { name: b.name })}
          />
        ))}
      </div>

      <ol
        className="plain-list"
        aria-label={t('storage.pipeline')}
        style={{ ...AUTO_GRID(180), gap: 0, border: '1px solid var(--bd2)', borderRadius: 10, overflow: 'hidden' }}
      >
        {s.pipeline.map((p) => (
          <li key={p.step} style={{ padding: '11px 14px', borderRight: '1px solid var(--bd2)', marginRight: -1 }}>
            <div className="hstack" style={{ gap: 6 }}>
              <Dot tone={p.healthy ? 'good' : 'warn'} label={p.healthy ? t('storage.stepHealthy') : t('storage.stepDegraded')} />
              <b style={{ fontSize: 12 }}>{p.step}</b>
            </div>
            <div className="faint" style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>
              {p.description}
            </div>
          </li>
        ))}
      </ol>

      <div style={{ ...AUTO_GRID(240), gap: 14 }}>
        <Field label={t('storage.archiveAfter')}>
          {(fp) => (
            <div className="hstack" style={{ alignItems: 'flex-start' }}>
              {manage ? (
                <CommitNumberInput
                  id={fp.id}
                  key={s.archiveAfterDays}
                  value={s.archiveAfterDays}
                  min={1}
                  max={3650}
                  label={t('storage.archiveAfterLabel')}
                  rangeMessage={t('storage.archiveRange')}
                  style={{ ...CTRL, width: 76 }}
                  onCommit={(archiveAfterDays) =>
                    update.mutate({ archiveAfterDays }, { onSuccess: () => toast(t('storage.archiveSet', { days: archiveAfterDays })) })
                  }
                />
              ) : (
                <b id={fp.id}>{s.archiveAfterDays}</b>
              )}
              <span className="muted" style={{ fontSize: 12, paddingTop: 8 }}>
                {t('storage.archiveUnit')}
              </span>
            </div>
          )}
        </Field>
        <Field label={t('storage.renditionLadder')}>
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.renditionLadder}
              options={opts(RENDITION_LADDERS, (v) => t(`storage.renditionLadders.${v}`))}
              disabled={!manage}
              onChange={(renditionLadder) =>
                update.mutate(
                  { renditionLadder },
                  {
                    onSuccess: () => toast(t('storage.renditionSet', { ladder: t(`storage.renditionLadders.${renditionLadder}`) })),
                  },
                )
              }
            />
          )}
        </Field>
        <div>
          <div className="field-label" aria-hidden="true" style={{ margin: 0 }}>
            {t('storage.directUploads')}
          </div>
          <div className="hstack" style={{ gap: 10, marginTop: 6 }}>
            <Toggle
              on={s.directUploads}
              label={t('storage.directUploads')}
              disabled={!manage}
              onChange={(directUploads) =>
                update.mutate(
                  { directUploads },
                  {
                    onSuccess: () => toast(directUploads ? t('storage.directOn') : t('storage.directOff')),
                  },
                )
              }
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {t('storage.directSub')}
            </span>
          </div>
        </div>
      </div>

      <div className="table-scroll" style={{ ...DIVIDER, marginTop: 14, paddingTop: 12 }}>
        <div role="table" aria-label={t('storage.footprint')} style={{ minWidth: 420 }}>
          <div role="row" style={{ ...SUB_HEAD, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, padding: '6px 0' }}>
            <div role="columnheader">{t('storage.footprint')}</div>
            <div role="columnheader">{t('storage.storageCol')}</div>
            <div role="columnheader">{t('storage.bandwidthCol')}</div>
          </div>
          {s.footprint.map((r) => (
            <div
              key={r.name}
              role="row"
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                gap: 10,
                padding: '8px 0',
                borderBottom: '1px solid var(--bd2)',
                fontSize: 12.5,
              }}
            >
              <div role="cell" style={{ fontWeight: 600 }}>
                {r.tenantId ? (
                  <Link className="row-link" to={`/tenants/${r.tenantId}`}>
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </div>
              <div role="cell">{t('storage.terabytes', { value: r.storageTb })}</div>
              <div role="cell" className="muted">
                {t('storage.terabytes', { value: r.bandwidthTb })}
              </div>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          {t('storage.footnote')}
        </p>
      </div>
    </Card>
  );
}
