import { useState } from 'react';
import { Card, QueryState, Screen, SkeletonRows } from '@/components/ui';
import { SectionedPage } from '@/components/ui/Sectioned';
import { useCan } from '@/features/auth/useCan';
import { useSection } from '@/lib/useSection';
import { usePlatformSettings, useSettingsMeta } from '../api';
import { AppearanceCard } from '../components/AppearanceCard';
import { BrandAssetsCard } from '../components/BrandAssetsCard';
import { IntegrationsCard } from '../components/IntegrationsCard';
import { changedFromDefault, SCREEN_SECTIONS, SECTION_ICONS, type ScreenSection } from '../components/sectionConfig';
import { SettingsSectionForm } from '../components/SettingsSectionForm';
import { TaxCard } from '../components/TaxCard';
import { useT } from '../i18n';
import { SETTINGS_SECTIONS, type SettingsSection } from '../types';

const isSettingsSection = (s: ScreenSection): s is SettingsSection => (SETTINGS_SECTIONS as readonly string[]).includes(s);

export default function SettingsPage() {
  const t = useT();
  const can = useCan();
  const manage = can('platform.manage');
  const settings = usePlatformSettings();
  const meta = useSettingsMeta();
  const [active, setActive, sectionHref] = useSection<ScreenSection>(SCREEN_SECTIONS, 'platform');
  const [dirty, setDirty] = useState(false);

  const sections = SCREEN_SECTIONS.map((id) => {
    const count = settings.data && isSettingsSection(id) ? changedFromDefault(settings.data, meta.data?.fields, id).length : 0;
    return {
      id,
      label: t(`sections.${id}.label`),
      icon: SECTION_ICONS[id],
      badge: count,
      badgeLabel: t('page.changedBadge', { count }),
    };
  });

  return (
    <Screen max={1120} label={t('page.title')}>
      {!manage && (
        <p className="note" style={{ margin: 0 }}>
          {t('page.readOnly')}
        </p>
      )}
      <SectionedPage
        sections={sections}
        active={active}
        onChange={setActive}
        label={t('page.nav')}
        href={sectionHref}
        confirmSwitch={dirty}
      >
        {active === 'appearance' ? (
          <AppearanceCard />
        ) : active === 'tax' ? (
          <TaxCard />
        ) : active === 'integrations' ? (
          <IntegrationsCard />
        ) : (
          <QueryState
            query={settings}
            skeleton={
              <Card>
                <SkeletonRows rows={6} />
              </Card>
            }
          >
            {(s) => (
              <>
                {active === 'branding' && <BrandAssetsCard assets={s.brandAssets} manage={manage} />}
                <SettingsSectionForm
                  key={active}
                  section={active}
                  settings={s}
                  meta={meta.data?.fields}
                  manage={manage}
                  onDirtyChange={setDirty}
                />
              </>
            )}
          </QueryState>
        )}
      </SectionedPage>
    </Screen>
  );
}
