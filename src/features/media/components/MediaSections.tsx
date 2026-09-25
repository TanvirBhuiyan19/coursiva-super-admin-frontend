import { Link } from 'react-router-dom';
import { Badge, Bar, Card, ConfirmButton, Dot, Field, Select, Toggle, ToggleRow } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { CommitNumberInput } from '@/components/ui';
import { money, num, timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRotateDrmKeys, useUpdateDrm, useUpdateLiveRooms, useUpdateStorage } from '../api';
import {
  DRM_AVAILABILITY,
  DRM_AVAILABILITY_LABELS,
  DRM_SECURITY_LEVEL_LABELS,
  DRM_SECURITY_LEVELS,
  RENDITION_LADDER_LABELS,
  RENDITION_LADDERS,
  WATERMARK_STYLE_LABELS,
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

const opts = <V extends string>(values: readonly V[], labels: Record<V, string>) => values.map((v) => [v, labels[v]] as const);

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
function usageNote(u: LiveRoomUsage) {
  if (u.status === 'byo') return 'BYO provider';
  if (u.status === 'over') return 'Over — billed as overage';
  return 'Within allowance';
}

export function LiveRoomsCard({ s }: { s: LiveRoomSettings }) {
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateLiveRooms();
  return (
    <Card title="Live classes · video providers">
      <p className="muted t-sm" style={{ lineHeight: 1.55 }}>
        Tenants bring their own Zoom, Google Meet or Teams account by default. Built-in rooms are platform-hosted video that costs
        participant-minutes — gate them by plan.
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
                { onSuccess: () => toast(`${p.label} — turned ${enabled ? 'on' : 'off'}`) },
              )
            }
          />
        ))}
      </div>

      <h3 style={{ ...SUB_HEAD, marginTop: 16, marginBottom: 4 }}>Built-in room allowance by plan</h3>
      <ul className="plain-list">
        {s.allowances.map((a) => (
          <li key={a.plan} className="row wrap" style={{ padding: '10px 0', fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, width: 80 }}>{a.plan}</span>
            {manage ? (
              <CommitNumberInput
                key={a.minutes}
                value={a.minutes}
                min={0}
                max={1_000_000}
                label={`${a.plan} built-in room minutes per month`}
                rangeMessage="Whole minutes, 0 or more (0 = BYO only)"
                style={{ width: 96, padding: '5px 8px', textAlign: 'right' }}
                onCommit={(minutes) =>
                  update.mutate(
                    { allowances: [{ plan: a.plan, minutes }] },
                    {
                      onSuccess: () =>
                        toast(
                          minutes
                            ? `${a.plan}: ${num(minutes)} built-in room minutes a month — tenant limits updated`
                            : `${a.plan}: built-in rooms off — BYO provider only`,
                        ),
                    },
                  )
                }
              />
            ) : (
              <span style={{ fontWeight: 600, width: 96, textAlign: 'right' }}>{num(a.minutes)}</span>
            )}
            <Badge tone={a.minutes > 0 ? 'good' : 'flat'}>min/mo</Badge>
            <span className="muted" style={{ flex: 1, minWidth: 160 }}>
              {a.minutes > 0 ? 'Built-in rooms included' : 'BYO Zoom / Meet / Teams only'}
            </span>
          </li>
        ))}
      </ul>
      <p className="faint t-xs" style={{ marginTop: 8, lineHeight: 1.5 }}>
        Above the allowance: ${s.overageRate} / participant-minute, or tenants top up with the “Live room minutes · {num(s.topUp.minutes)}”
        add-on ({money(s.topUp.price)}) — both bill on their next invoice. Per-tenant overrides are set in the tenant drawer.
      </p>

      <h3 style={{ ...SUB_HEAD, marginTop: 16, marginBottom: 4 }}>Minutes used this month</h3>
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
                  · {u.plan}
                </span>
              </span>
              <div style={{ width: 110 }}>
                <Bar value={pctUsed} tone={u.status === 'over' ? 'bad' : undefined} label={`${u.name}: ${pctUsed}% of allowance used`} />
              </div>
              <span style={{ width: 120, textAlign: 'right', fontWeight: 700 }}>
                {u.status === 'byo' ? '—' : `${num(u.usedMinutes)} / ${num(u.allowanceMinutes)}`}
              </span>
              <span className={u.status === 'over' ? 'fg-bad' : 'muted'} style={{ width: 150, textAlign: 'right' }}>
                {usageNote(u)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="faint t-xs" style={{ marginTop: 10, lineHeight: 1.5 }}>
        Rooms run on our video SDK in eu-west and us-east. Recordings land in the tenant’s R2 prefix and inherit their DRM policy.
      </p>
    </Card>
  );
}

// ---------- DRM ----------
export function DrmCard({ s }: { s: DrmSettings }) {
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateDrm();
  const rotate = useRotateDrmKeys();
  const active = s.providers.filter((p) => p.connected).map((p) => p.name);
  return (
    <Card
      title="Video DRM & content protection"
      right={
        <Badge pill tone="good">
          All streams protected
        </Badge>
      }
    >
      <p className="muted t-sm">Platform-wide defaults. Tenants can tighten these per course, never loosen them.</p>
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
                Always on
              </span>
            ) : (
              <Toggle
                on={p.enabled}
                label={p.label}
                disabled={!manage}
                onChange={(enabled) =>
                  update.mutate(
                    { protections: [{ key: p.key, enabled }] },
                    { onSuccess: () => toast(`${p.label} ${enabled ? 'enabled' : 'disabled'} platform-wide`) },
                  )
                }
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ ...AUTO_GRID(220), gap: 14 }}>
        <Field label="Security level">
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.securityLevel}
              options={opts(DRM_SECURITY_LEVELS, DRM_SECURITY_LEVEL_LABELS)}
              disabled={!manage}
              onChange={(securityLevel) =>
                update.mutate(
                  { securityLevel },
                  { onSuccess: () => toast(`Security level set to ${DRM_SECURITY_LEVEL_LABELS[securityLevel]}`) },
                )
              }
            />
          )}
        </Field>
        <Field label="Watermark style">
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.watermarkStyle}
              options={opts(WATERMARK_STYLES, WATERMARK_STYLE_LABELS)}
              disabled={!manage}
              onChange={(watermarkStyle) =>
                update.mutate(
                  { watermarkStyle },
                  { onSuccess: () => toast(`Watermark style set to ${WATERMARK_STYLE_LABELS[watermarkStyle]}`) },
                )
              }
            />
          )}
        </Field>
        <Field label="Concurrent device leases">
          {(fp) =>
            manage ? (
              <CommitNumberInput
                id={fp.id}
                key={s.deviceLeases}
                value={s.deviceLeases}
                min={1}
                max={20}
                label="Concurrent device leases"
                rangeMessage="Whole number, 1–20"
                style={{ ...CTRL, width: 90 }}
                onCommit={(deviceLeases) =>
                  update.mutate({ deviceLeases }, { onSuccess: () => toast(`Students can now stream on ${deviceLeases} devices at once`) })
                }
              />
            ) : (
              <div id={fp.id} style={{ fontWeight: 600 }}>
                {s.deviceLeases}
              </div>
            )
          }
        </Field>
        <Field label="DRM available on">
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.availableOn}
              options={opts(DRM_AVAILABILITY, DRM_AVAILABILITY_LABELS)}
              disabled={!manage}
              onChange={(availableOn) =>
                update.mutate(
                  { availableOn },
                  { onSuccess: () => toast(`DRM now available on ${DRM_AVAILABILITY_LABELS[availableOn].toLowerCase()}`) },
                )
              }
            />
          )}
        </Field>
      </div>

      <div style={DIVIDER}>
        <div className="hstack" style={{ gap: 10 }}>
          <h3 style={{ fontWeight: 700, fontSize: 13.5, flex: 1 }}>DRM provider credentials</h3>
          {active.length === 0 && (
            <Badge pill tone="bad">
              Setup required
            </Badge>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 3 }}>
          {active.length
            ? `Active: ${active.join(' + ')}`
            : 'No DRM provider connected — hardware DRM toggles have no effect until one is verified'}
          . Keys are encrypted with the platform KMS and never exposed to tenants or shown again after saving.
        </p>
        <div style={AUTO_GRID(240)}>
          {s.providers.map((p) => (
            <ConnectionCard
              key={p.key}
              kind="drm"
              badge
              connection={p}
              connectedToast={`${p.name} verified — license requests routing through it`}
              disconnectedToast={`${p.name} disconnected — playback falls back to AES-128 only`}
            />
          ))}
        </div>
      </div>

      <div className="hstack wrap" style={{ ...DIVIDER, gap: 12, marginTop: 16 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3 style={{ fontWeight: 600, fontSize: 13 }}>License signing keys</h3>
          <div className="faint t-xs" style={{ marginTop: 1 }}>
            Last rotated {timeAgo(s.keysRotatedAt)} · rotation forces re-licensing on next play
          </div>
        </div>
        {manage && (
          <ConfirmButton
            className="btn"
            confirmLabel="Confirm rotation"
            pending={rotate.isPending}
            onConfirm={() =>
              rotate.mutate(undefined, { onSuccess: () => toast('License keys rotated — active sessions re-key within 24h') })
            }
          >
            Rotate keys
          </ConfirmButton>
        )}
      </div>
    </Card>
  );
}

// ---------- Storage ----------
export function StorageCard({ s }: { s: StorageSettings }) {
  const can = useCan();
  const manage = can('platform.manage');
  const update = useUpdateStorage();
  const healthy = s.pipeline.every((p) => p.healthy);
  return (
    <Card
      title="Storage & delivery"
      right={
        <Badge pill tone={healthy ? 'good' : 'warn'}>
          {healthy ? 'Pipeline healthy' : 'Pipeline degraded'}
        </Badge>
      }
    >
      <p className="muted t-sm">
        Masters live in S3 with lifecycle to Deep Archive; transcoded HLS renditions stream from R2 behind the CDN with zero egress.
      </p>
      <Stats items={s.stats} />
      <div style={AUTO_GRID(300)}>
        {s.backends.map((b) => (
          <ConnectionCard
            key={b.key}
            kind="storage"
            connection={b}
            connectedToast={`${b.name} verified — bucket reachable, CORS ok`}
            disconnectedToast={`${b.name} disconnected — uploads and playback using it stop until it is reconnected`}
          />
        ))}
      </div>

      <ol
        className="plain-list"
        aria-label="Media pipeline"
        style={{ ...AUTO_GRID(180), gap: 0, border: '1px solid var(--bd2)', borderRadius: 10, overflow: 'hidden' }}
      >
        {s.pipeline.map((p) => (
          <li key={p.step} style={{ padding: '11px 14px', borderRight: '1px solid var(--bd2)', marginRight: -1 }}>
            <div className="hstack" style={{ gap: 6 }}>
              <Dot tone={p.healthy ? 'good' : 'warn'} label={p.healthy ? 'Healthy' : 'Degraded'} />
              <b style={{ fontSize: 12 }}>{p.step}</b>
            </div>
            <div className="faint" style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.4 }}>
              {p.description}
            </div>
          </li>
        ))}
      </ol>

      <div style={{ ...AUTO_GRID(240), gap: 14 }}>
        <Field label="Archive masters after">
          {(fp) => (
            <div className="hstack" style={{ alignItems: 'flex-start' }}>
              {manage ? (
                <CommitNumberInput
                  id={fp.id}
                  key={s.archiveAfterDays}
                  value={s.archiveAfterDays}
                  min={1}
                  max={3650}
                  label="Archive masters after (days)"
                  rangeMessage="Whole days, 1–3,650"
                  style={{ ...CTRL, width: 76 }}
                  onCommit={(archiveAfterDays) =>
                    update.mutate(
                      { archiveAfterDays },
                      { onSuccess: () => toast(`Masters now move to Glacier Deep Archive after ${num(archiveAfterDays)} days`) },
                    )
                  }
                />
              ) : (
                <b id={fp.id}>{s.archiveAfterDays}</b>
              )}
              <span className="muted" style={{ fontSize: 12, paddingTop: 8 }}>
                days → Glacier Deep Archive
              </span>
            </div>
          )}
        </Field>
        <Field label="Rendition ladder">
          {(fp) => (
            <Select
              {...fp}
              style={CTRL}
              value={s.renditionLadder}
              options={opts(RENDITION_LADDERS, RENDITION_LADDER_LABELS)}
              disabled={!manage}
              onChange={(renditionLadder) =>
                update.mutate(
                  { renditionLadder },
                  {
                    onSuccess: () =>
                      toast(`New uploads transcode to ${RENDITION_LADDER_LABELS[renditionLadder]} — existing videos keep their renditions`),
                  },
                )
              }
            />
          )}
        </Field>
        <div>
          <div className="field-label" aria-hidden="true" style={{ margin: 0 }}>
            Direct-to-bucket uploads
          </div>
          <div className="hstack" style={{ gap: 10, marginTop: 6 }}>
            <Toggle
              on={s.directUploads}
              label="Direct-to-bucket uploads"
              disabled={!manage}
              onChange={(directUploads) =>
                update.mutate(
                  { directUploads },
                  {
                    onSuccess: () =>
                      toast(directUploads ? 'Uploads now go straight to the bucket' : 'Uploads now pass through the app servers'),
                  },
                )
              }
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Multipart uploads bypass app servers
            </span>
          </div>
        </div>
      </div>

      <div className="table-scroll" style={{ ...DIVIDER, marginTop: 14, paddingTop: 12 }}>
        <div role="table" aria-label="Top tenants by media footprint" style={{ minWidth: 420 }}>
          <div role="row" style={{ ...SUB_HEAD, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, padding: '6px 0' }}>
            <div role="columnheader">Top tenants by media footprint</div>
            <div role="columnheader">Storage</div>
            <div role="columnheader">Bandwidth · 30d</div>
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
              <div role="cell">{num(r.storageTb)} TB</div>
              <div role="cell" className="muted">
                {num(r.bandwidthTb)} TB
              </div>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          Usage meters feed tenant overage billing on the Revenue page. Keys are prefixed per tenant — one bucket, isolated paths.
        </p>
      </div>
    </Card>
  );
}
