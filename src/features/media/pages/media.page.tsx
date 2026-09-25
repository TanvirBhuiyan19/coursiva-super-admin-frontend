import { Card, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { useDrm, useLiveRooms, useStorage } from '../api';
import { DrmCard, LiveRoomsCard, StorageCard } from '../components/MediaSections';
import { useT } from '../i18n';

const skeleton = (
  <Card>
    <SkeletonRows rows={8} />
  </Card>
);

export default function MediaPage() {
  const t = useT();
  const liveRooms = useLiveRooms();
  const drm = useDrm();
  const storage = useStorage();
  return (
    <Screen max={1000} label={t('title')}>
      <QueryState query={liveRooms} skeleton={skeleton}>
        {(s) => <LiveRoomsCard s={s} />}
      </QueryState>
      <QueryState query={drm} skeleton={skeleton}>
        {(s) => <DrmCard s={s} />}
      </QueryState>
      <QueryState query={storage} skeleton={skeleton}>
        {(s) => <StorageCard s={s} />}
      </QueryState>
    </Screen>
  );
}
