import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, SkeletonRows, Toggle } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { useCan } from '@/features/auth/useCan';
import { useExtensions } from '@/features/extensions/api';
import { toast } from '@/store/ui';
import { useAvailability, useSetAvailability } from '../api';
import { useT } from '../i18n';
import type { Capability } from '../types';

const LIST = { margin: '8px 0 10px', paddingLeft: 18, display: 'grid', gap: 3 } as const;

/** "N schools pay for {ext}; their billing is unchanged" — with the extensions' names when the viewer can read them. */
function PayingNote({ count, ext }: { count: number; ext: string }) {
  const t = useT();
  return (
    <p style={{ margin: '0 0 8px' }}>
      {t('availability.confirm.paying', { count, ext })}{' '}
      <Link to={pathOf('revenue')} className="link">
        {t('availability.confirm.billingLink')}
      </Link>
    </p>
  );
}

function NamedPayingNote({ c, count }: { c: Capability; count: number }) {
  const list = useExtensions();
  return <PayingNote count={count} ext={c.extensions.map((k) => list.data?.find((e) => e.key === k)?.name ?? k).join(', ')} />;
}

/** What switching a capability off takes away: its surfaces, the schools using it and the paying-schools note. */
function Impact({ capKey }: { capKey: string }) {
  const t = useT();
  const can = useCan();
  const query = useAvailability();
  const c = query.data?.capabilities.find((x) => x.key === capKey);
  if (!c) return query.isPending ? <SkeletonRows rows={3} /> : null;
  const paying = c.payingSchools ?? 0;
  return (
    <>
      <p style={{ margin: 0 }}>{t('availability.confirm.lead')}</p>
      <ul style={LIST}>
        {c.surfaces.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p style={{ margin: '0 0 8px' }}>
        {c.schoolsUsing == null
          ? t('availability.confirm.usedUnknown')
          : c.schoolsUsing === 0
            ? t('availability.confirm.unused')
            : t('availability.confirm.used', { count: c.schoolsUsing })}
      </p>
      {paying > 0 && (can('billing.view') ? <NamedPayingNote c={c} count={paying} /> : <PayingNote count={paying} ext={c.label} />)}
      <p className="muted" style={{ margin: 0 }}>
        {t('availability.confirm.reversible')}
      </p>
    </>
  );
}

/**
 * The "available to schools" switch of one capability (Feature availability rows and connection cards). Turning it on
 * applies at once; turning it off first shows what disappears and is confirmed by typing the capability's name — then
 * the server asks for the password when it wasn't entered recently (423 → PasswordConfirmPrompt).
 */
export function AvailabilityToggle({ capability: c }: { capability: Pick<Capability, 'key' | 'label' | 'on'> }) {
  const t = useT();
  const can = useCan();
  const set = useSetAvailability();
  const [confirming, setConfirming] = useState(false);
  const apply = (on: boolean) =>
    set.mutate(
      { key: c.key, on },
      {
        onSuccess: () => {
          setConfirming(false);
          toast(t(on ? 'availability.turnedOn' : 'availability.turnedOff', { label: c.label }));
        },
      },
    );
  return (
    <>
      <Toggle
        on={c.on}
        label={t('availability.toggle', { label: c.label })}
        disabled={!can('platform.manage') || set.isPending}
        onChange={(on) => (on ? apply(true) : setConfirming(true))}
      />
      {confirming && (
        <ConfirmDialog
          title={t('availability.confirm.title', { label: c.label })}
          phrase={c.label}
          confirmLabel={t('availability.confirm.action')}
          pending={set.isPending}
          onConfirm={() => apply(false)}
          onCancel={() => setConfirming(false)}
        >
          <Impact capKey={c.key} />
        </ConfirmDialog>
      )}
    </>
  );
}
