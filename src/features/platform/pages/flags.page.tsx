import { Screen } from '@/components/ui';
import { Can } from '@/features/auth/Can';
import { BroadcastPanel, FlagsCard, SystemStatusCard } from '../components/FlagsSections';

export default function FlagsPage() {
  return (
    <Screen max={1000} label="Feature flags and status">
      <FlagsCard />
      <SystemStatusCard />
      <Can permission="announcements.send">
        <BroadcastPanel />
      </Can>
    </Screen>
  );
}
