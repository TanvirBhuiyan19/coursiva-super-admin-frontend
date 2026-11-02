import { Screen } from '@/components/ui';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import { useSection } from '@/lib/useSection';
import { BroadcastPanel, FlagsCard, SystemStatusCard } from '../components/FlagsSections';
import { useT } from '../i18n';

type Section = 'flags' | 'status' | 'broadcast';

export default function FlagsPage() {
  const t = useT();
  const can = useCan();
  // Broadcast is only offered to staff who may send announcements.
  const ids: Section[] = can('announcements.send') ? ['flags', 'status', 'broadcast'] : ['flags', 'status'];
  const [section, setSection, sectionHref] = useSection(ids, 'flags');
  return (
    <Screen max={1120} label={t('flags.screenLabel')}>
      <SectionedPage
        sections={ids.map((id) => ({ id, label: t(`sections.flags.${id}`) }))}
        active={section}
        onChange={setSection}
        label={t('sections.flags.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'flags'}>
          <FlagsCard />
        </SectionPanel>
        <SectionPanel active={section === 'status'}>
          {/* Polls only while this section is the one on screen. */}
          <SystemStatusCard visible={section === 'status'} />
        </SectionPanel>
        {ids.includes('broadcast') && (
          <SectionPanel active={section === 'broadcast'}>
            <BroadcastPanel />
          </SectionPanel>
        )}
      </SectionedPage>
    </Screen>
  );
}
