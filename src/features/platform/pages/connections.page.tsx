import { Link } from 'react-router-dom';
import { Card, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { pathOf } from '@/app/screens';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import { ConnectionCard } from '@/features/media';
import { useSection } from '@/lib/useSection';
import { AvailabilityToggle } from '../components/AvailabilityToggle';
import { useDeleteConnection, usePlatformConnections, useSaveConnection, useTestConnection } from '../api';
import { useT } from '../i18n';
import type { ConnectionKind, PlatformConnection } from '../types';

const SECTIONS = [
  'payments',
  'cdn',
  'push',
  'email',
  'ads',
  'insights',
  'ai',
  'security',
  'monitoring',
  'video',
  'oauth',
] as const satisfies readonly ConnectionKind[];

/** Tab icons (24×24 outline paths). */
const SECTION_ICONS: Record<(typeof SECTIONS)[number], string> = {
  payments: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h3',
  cdn: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  push: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  email: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  ads: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13',
  insights: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  ai: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  security: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  monitoring: 'M22 12h-4l-3 9L9 3l-3 9H2',
  video: 'M15 10l5-3v10l-5-3zM3 6h12v12H3z',
  oauth: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7zM16 9h.01',
};

const GRID = (min: number) =>
  ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 12 }) as const;

/** One card per connection, each with its own mutation state. */
function PlatformConnectionCard({ c }: { c: PlatformConnection }) {
  const t = useT();
  const can = useCan();
  const save = useSaveConnection();
  const disconnect = useDeleteConnection();
  const test = useTestConnection();
  return (
    <ConnectionCard
      connection={c}
      save={save}
      disconnect={disconnect}
      test={test}
      manage={can('platform.manage') && (c.kind !== 'payments' || can('billing.manage'))}
      connectedToast={t('connections.connected', { name: c.name })}
      disconnectedToast={t('connections.disconnected', { name: c.name })}
    >
      {c.capabilities.length > 0 && <AvailableToSchools c={c} />}
    </ConnectionCard>
  );
}

/** The switches of the capabilities this service powers: connect Daily, then make built-in rooms available to schools. */
function AvailableToSchools({ c }: { c: PlatformConnection }) {
  const t = useT();
  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bd2)' }}>
      <h4
        className="faint"
        style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {t('connections.availableHeading')}
      </h4>
      <ul className="plain-list">
        {c.capabilities.map((cap) => (
          <li key={cap.key} className="hstack" style={{ gap: 10, padding: '4px 0', fontSize: 12 }}>
            <span className="min0" style={{ flex: 1 }}>
              {cap.label}
            </span>
            <AvailabilityToggle capability={cap} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, sub, list, min = 300 }: { title: string; sub: string; list: PlatformConnection[]; min?: number }) {
  return (
    <Card title={title} sub={sub}>
      <div style={GRID(min)}>
        {list.map((c) => (
          <PlatformConnectionCard key={c.key} c={c} />
        ))}
      </div>
    </Card>
  );
}

export default function ConnectionsPage() {
  const t = useT();
  const query = usePlatformConnections();
  const [section, setSection, sectionHref] = useSection(SECTIONS, 'payments');
  const of = (all: PlatformConnection[], kind: ConnectionKind) => all.filter((c) => c.kind === kind);
  return (
    <Screen max={1250} label={t('connections.screenLabel')}>
      <Card>
        <p className="t-sm muted" style={{ margin: 0, lineHeight: 1.55 }}>
          {t('connections.intro')}{' '}
          <Link to={pathOf('media')} className="link">
            {t('connections.mediaLink')}
          </Link>
        </p>
      </Card>
      <SectionedPage
        sections={SECTIONS.map((id) => ({ id, label: t(`sections.connections.${id}`), icon: SECTION_ICONS[id] }))}
        active={section}
        onChange={setSection}
        label={t('sections.connections.nav')}
        href={sectionHref}
      >
        <QueryState query={query} skeleton={<SkeletonRows rows={6} />}>
          {(all) =>
            SECTIONS.map((kind) => (
              <SectionPanel key={kind} active={section === kind}>
                <Section
                  title={t(`connections.${kind}`)}
                  sub={t(`connections.${kind}Sub`)}
                  list={of(all, kind)}
                  min={kind === 'oauth' ? 260 : 300}
                />
              </SectionPanel>
            ))
          }
        </QueryState>
      </SectionedPage>
    </Screen>
  );
}
