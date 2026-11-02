import { Card, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { useSection } from '@/lib/useSection';
import { useDrm, useLiveRooms, useStorage } from '../api';
import { DrmCard, LiveRoomsCard, StorageCard } from '../components/MediaSections';
import { useT } from '../i18n';

const SECTIONS = ['live', 'drm', 'storage'] as const;

const skeleton = (
  <Card>
    <SkeletonRows rows={8} />
  </Card>
);

export default function MediaPage() {
  const t = useT();
  const [section, setSection, sectionHref] = useSection(SECTIONS, 'live');
  const liveRooms = useLiveRooms();
  const drm = useDrm();
  const storage = useStorage();
  return (
    <Screen max={1120} label={t('title')}>
      <SectionedPage
        sections={SECTIONS.map((id) => ({ id, label: t(`sections.${id}`) }))}
        active={section}
        onChange={setSection}
        label={t('sections.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'live'}>
          <QueryState query={liveRooms} skeleton={skeleton}>
            {(s) => <LiveRoomsCard s={s} />}
          </QueryState>
        </SectionPanel>
        <SectionPanel active={section === 'drm'}>
          <QueryState query={drm} skeleton={skeleton}>
            {(s) => <DrmCard s={s} />}
          </QueryState>
        </SectionPanel>
        <SectionPanel active={section === 'storage'}>
          <QueryState query={storage} skeleton={skeleton}>
            {(s) => <StorageCard s={s} />}
          </QueryState>
        </SectionPanel>
      </SectionedPage>
    </Screen>
  );
}
