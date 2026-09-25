import { Screen } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { BroadcastPanel, FlagsCard, SystemStatusCard } from '../components/FlagsSections';
import { useT } from '../i18n';

export default function FlagsPage() {
  const t = useT();
  return (
    <Screen max={1000} label={t('flags.screenLabel')}>
      <FlagsCard />
      <SystemStatusCard />
      <Can permission="announcements.send">
        <BroadcastPanel />
      </Can>
    </Screen>
  );
}
