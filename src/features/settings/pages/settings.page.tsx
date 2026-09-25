import { Card, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { usePlatformSettings } from '../api';
import { AppearanceCard } from '../components/AppearanceCard';
import { IntegrationsCard } from '../components/IntegrationsCard';
import { PlatformSettingsForm } from '../components/PlatformSettingsForm';
import { TaxCard } from '../components/TaxCard';

function GroupHeading({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div id={id} className="eyebrow">
        {title}
      </div>
      <p className="t-sm muted" style={{ margin: '3px 0 0' }}>
        {sub}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const settings = usePlatformSettings();
  return (
    <Screen max={780} label="Settings">
      <section aria-labelledby="personal-settings" className="stack" style={{ gap: 12 }}>
        <GroupHeading id="personal-settings" title="Personal" sub="Your own console preferences. Nothing here affects other staff." />
        <AppearanceCard />
      </section>

      <section aria-labelledby="platform-settings" className="stack" style={{ gap: 12 }}>
        <GroupHeading
          id="platform-settings"
          title="Platform"
          sub="Shared by every staff member and tenant. Changes are saved to the platform and recorded in the audit log."
        />
        <QueryState
          query={settings}
          skeleton={
            <Card>
              <SkeletonRows rows={8} />
            </Card>
          }
        >
          {(s) => <PlatformSettingsForm settings={s} />}
        </QueryState>
        <IntegrationsCard />
        <TaxCard />
      </section>
    </Screen>
  );
}
