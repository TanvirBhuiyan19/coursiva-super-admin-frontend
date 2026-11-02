import { useId, useState, type ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { ConfirmButton, Dot, FormError, Seg } from '@/components/ui';
import { useCan } from '@/features/auth/useCan';
import { toCamel } from '@/lib/api/case';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useConnect, useDisconnect, type ConnectionKind } from '../api';
import { useT } from '../i18n';
import type { Connection, ConnectionTest, CredentialsInput } from '../types';

type SaveInput = CredentialsInput & { key: string };

interface Props {
  connection: Connection;
  /** Connect & verify / replace credentials. */
  save: UseMutationResult<Connection, Error, SaveInput>;
  disconnect: UseMutationResult<Connection, Error, string>;
  /** Re-verifies the stored credentials, when the endpoint offers it. */
  test?: UseMutationResult<ConnectionTest, Error, string>;
  /** Show the provider's initial as a badge (DRM providers). */
  badge?: boolean;
  connectedToast: string;
  disconnectedToast: string;
  /** Whether the viewer may change it (default: platform.manage). */
  manage?: boolean;
  /** Extra controls under the credentials (e.g. the Connections screen's "Available to schools" switches). */
  children?: ReactNode;
}

/** A media connection (DRM provider or storage backend) with its media endpoints. */
export function MediaConnectionCard({ kind, ...props }: Omit<Props, 'save' | 'disconnect' | 'test'> & { kind: ConnectionKind }) {
  const save = useConnect(kind);
  const disconnect = useDisconnect(kind);
  return <ConnectionCard {...props} save={save} disconnect={disconnect} />;
}

/**
 * A connectable service with masked credential inputs. Stored values are never sent to the browser:
 * configured fields show the last four characters, and typing a value replaces it on save (blank keeps it).
 * The server verifies credentials with the provider before saving; its refusal is shown on the card.
 */
export function ConnectionCard({
  connection: c,
  badge,
  connectedToast,
  disconnectedToast,
  save: connect,
  disconnect,
  test,
  manage: manageProp,
  children,
}: Props) {
  const t = useT();
  const can = useCan();
  const manage = manageProp ?? can('platform.manage');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<string[]>([]);
  const uid = useId();
  const typed = Object.values(drafts).some((v) => v.trim());
  const apiErr = connect.error instanceof ApiError && connect.error.isValidation ? connect.error : null;
  const fieldError = (key: string) => apiErr?.field(`credentials.${toCamel(key)}`);
  // A provider refusing the credentials as a whole (e.g. "Stripe rejected these credentials: …").
  const rejected = apiErr?.field('credentials');

  const save = () =>
    connect.mutate(
      { key: c.key, credentials: Object.entries(drafts).map(([field, value]) => ({ field, value })) },
      {
        onSuccess: () => {
          setDrafts({});
          setShown([]);
          toast(c.connected ? t('connection.updated', { name: c.name }) : connectedToast);
        },
      },
    );

  return (
    <section
      aria-label={c.name}
      style={{ border: '1px solid var(--bd)', borderRadius: 11, padding: 14, minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div className="hstack" style={{ gap: 9 }}>
        {badge && (
          <div
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'var(--acT)',
              color: 'var(--ac)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {c.name.charAt(0)}
          </div>
        )}
        <h3 className="min0" style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
          {c.name}
          {c.role && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--ac)',
                background: 'var(--acT)',
                borderRadius: 99,
                padding: '2px 8px',
                marginLeft: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {c.role}
            </span>
          )}
        </h3>
        <span
          className="nowrap hstack"
          style={{ gap: 5, fontSize: 10.5, fontWeight: 700, color: c.connected ? 'var(--gFg)' : 'var(--tx3)' }}
        >
          {c.connected && <Dot tone="good" size={6} />}
          {c.connected ? t('connection.connected') : t('connection.notConnected')}
        </span>
      </div>
      <div className="faint" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.45 }}>
        {c.description}
        {c.verifiedAt && t('connection.verified', { ago: timeAgo(c.verifiedAt) })}
      </div>
      <div className="stack" style={{ gap: 7, marginTop: 10 }}>
        {c.fields.map((fd) => {
          const vis = !fd.secret || shown.includes(fd.key);
          const err = fieldError(fd.key);
          const errId = `${uid}-${fd.key}`;
          if (fd.options) {
            // A fixed choice: a switch, never a text box. Picking the stored value again clears the draft.
            const stored = fd.value ?? fd.default ?? fd.options[0]?.value ?? '';
            return (
              <div key={fd.key} className="hstack" style={{ gap: 9, alignItems: 'center' }}>
                <span className="faint" style={{ fontSize: 11.5 }}>
                  {fd.label}
                </span>
                <Seg
                  label={t('connection.fieldLabel', { name: c.name, label: fd.label })}
                  options={fd.options.map((o) => [o.value, o.label] as const)}
                  value={drafts[fd.key] || stored}
                  disabled={!manage}
                  onChange={(v) =>
                    setDrafts((m) => {
                      const { [fd.key]: _drop, ...rest } = m;
                      return v === stored ? rest : { ...m, [fd.key]: v };
                    })
                  }
                />
                {err && (
                  <div id={errId} className="field-error" role="alert">
                    {err}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={fd.key}>
              <div className="hstack" style={{ gap: 7 }}>
                <input
                  className="input"
                  type={vis ? 'text' : 'password'}
                  // Browsers ignore "off" on password inputs and fill in the signed-in user's saved login (it ended up
                  // in API-token fields); "new-password" marks it as a new secret, and the data-* opt password managers out.
                  autoComplete={vis ? 'off' : 'new-password'}
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  value={drafts[fd.key] ?? ''}
                  placeholder={
                    fd.value
                      ? t('connection.valuePlaceholder', { label: fd.label, value: fd.value })
                      : fd.configured
                        ? t('connection.configuredPlaceholder', { label: fd.label, last4: fd.last4 ?? '' })
                        : fd.label
                  }
                  aria-label={t('connection.fieldLabel', { name: c.name, label: fd.label })}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? errId : undefined}
                  disabled={!manage}
                  style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 11.5, borderRadius: 7 }}
                  onChange={(e) => setDrafts((m) => ({ ...m, [fd.key]: e.target.value }))}
                />
                {fd.secret && manage && (
                  <button
                    type="button"
                    className="link link--muted"
                    style={{ fontSize: 10.5 }}
                    aria-label={t(vis ? 'connection.hideLabel' : 'connection.showLabel', { name: c.name, label: fd.label })}
                    aria-pressed={vis}
                    onClick={() => setShown((s) => (vis ? s.filter((k) => k !== fd.key) : [...s, fd.key]))}
                  >
                    {vis ? t('connection.hide') : t('connection.show')}
                  </button>
                )}
              </div>
              {err && (
                <div id={errId} className="field-error" role="alert">
                  {err}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {children}
      {rejected && <FormError>{rejected}</FormError>}
      {connect.error && !apiErr && <FormError>{errorMessage(connect.error)}</FormError>}
      {manage && (
        <div className="hstack" style={{ gap: 8, marginTop: 'auto', paddingTop: 10 }}>
          {(!c.connected || typed) && (
            <button type="button" className="btn btn--sm" style={{ flex: 1 }} disabled={connect.isPending} onClick={save}>
              {connect.isPending ? t('connection.verifying') : c.connected ? t('connection.reverify') : t('connection.connect')}
            </button>
          )}
          {c.connected && test && !typed && (
            <button
              type="button"
              className="btn btn--sm"
              style={{ flex: 1 }}
              disabled={test.isPending}
              onClick={() =>
                test.mutate(c.key, {
                  onSuccess: (r) =>
                    toast(r.ok ? t('connection.testOk', { name: c.name, ms: r.latencyMs }) : r.message, r.ok ? 'default' : 'error'),
                })
              }
            >
              {test.isPending ? t('connection.testing') : t('connection.test')}
            </button>
          )}
          {c.connected && (
            <ConfirmButton
              className="btn btn--sm"
              style={{ flex: 1 }}
              confirmLabel={t('connection.confirmDisconnect')}
              pending={disconnect.isPending}
              onConfirm={() =>
                disconnect.mutate(c.key, {
                  onSuccess: () => {
                    setDrafts({});
                    toast(disconnectedToast);
                  },
                })
              }
            >
              {t('connection.disconnect')}
            </ConfirmButton>
          )}
        </div>
      )}
    </section>
  );
}
