import { useRef, useState } from 'react';
import { Card, ConfirmButton, Spinner } from '@/components/ui';
import { SettingRow } from '@/components/ui/Sectioned';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { timeAgo } from '@/lib/format';
import { toast } from '@/store/ui';
import { useRemoveBrandAsset, useUploadBrandAsset } from '../api';
import { useT } from '../i18n';
import type { BrandAsset, BrandAssetSlot } from '../types';

/** Platform brand images. Each upload is its own multipart request, outside the Branding form. */
export function BrandAssetsCard({ assets, manage }: { assets: BrandAsset[]; manage: boolean }) {
  const t = useT();
  return (
    <Card title={t('assets.title')}>
      <p className="t-sm muted" style={{ margin: '-4px 0 4px' }}>
        {t('assets.sub')}
      </p>
      {assets.map((a) => (
        <AssetRow key={a.slot} asset={a} manage={manage} />
      ))}
      <p className="note" style={{ margin: '10px 0 0' }}>
        {t('assets.types')} {t('assets.svgNote')}
      </p>
    </Card>
  );
}

function AssetRow({ asset, manage }: { asset: BrandAsset; manage: boolean }) {
  const t = useT();
  const upload = useUploadBrandAsset();
  const remove = useRemoveBrandAsset();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const name = t(`assets.slots.${asset.slot}.label`);
  const dark = asset.slot === 'logo_dark';

  const onFile = (slot: BrandAssetSlot, file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    upload.mutate(
      { slot, file },
      {
        onSuccess: () => toast(t('assets.uploaded', { name })),
        onError: (err) => setError(err instanceof ApiError ? (err.field('file') ?? err.message) : errorMessage(err)),
      },
    );
    if (input.current) input.current.value = '';
  };

  return (
    <SettingRow
      label={name}
      help={
        <>
          {t(`assets.slots.${asset.slot}.help`)}
          {asset.updatedAt && <> · {t('assets.updated', { when: timeAgo(asset.updatedAt) })}</>}
        </>
      }
      error={error}
      kind="group"
    >
      {(p) => (
        <div className="stack" style={{ gap: 8, alignItems: 'flex-end', width: 280 }}>
          <div
            className="card card--inset hstack"
            style={{ justifyContent: 'center', width: '100%', minHeight: 64, background: dark ? 'var(--sb)' : 'var(--pg2)' }}
          >
            {asset.url ? (
              <img src={asset.url} alt={t('assets.preview', { name })} style={{ maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="t-xs" style={{ color: dark ? 'var(--sbTx)' : 'var(--tx3)' }}>
                {t('assets.none')}
              </span>
            )}
          </div>
          {manage && (
            <div className="hstack wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <input
                ref={input}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                aria-label={t('assets.choose', { name })}
                aria-describedby={p['aria-describedby']}
                onChange={(e) => onFile(asset.slot, e.target.files?.[0])}
              />
              <button type="button" className="btn btn--sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
                {upload.isPending && <Spinner />} {t('assets.choose', { name })}
              </button>
              {asset.url && (
                <ConfirmButton
                  className="btn btn--sm"
                  confirmLabel={t('assets.confirmRemove', { name })}
                  pending={remove.isPending}
                  onConfirm={() =>
                    remove.mutate(asset.slot, {
                      onSuccess: () => toast(t('assets.removed', { name })),
                      onError: (err) => setError(errorMessage(err)),
                    })
                  }
                >
                  {t('assets.remove', { name })}
                </ConfirmButton>
              )}
            </div>
          )}
        </div>
      )}
    </SettingRow>
  );
}
