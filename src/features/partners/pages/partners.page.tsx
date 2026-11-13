import { useState } from 'react';
import { CountUp, ErrorState, Screen, Skeleton } from '@/components/ui';
import { SectionedPage, SectionPanel } from '@/components/ui/Sectioned';
import { num } from '@/lib/format';
import { useSection } from '@/lib/useSection';
import { usePartnersSummary } from '../api';
import { CommissionsSection, PartnerTable, ReferralsSection } from '../components/PartnerLists';
import { cents } from '../format';
import { PartnerDrawer } from '../components/PartnerDrawer';
import { PayoutsSection, SettingsSection, TaxFormsSection } from '../components/PartnerMoney';
import { useT } from '../i18n';

const SECTIONS = ['applications', 'partners', 'referrals', 'commissions', 'payouts', 'taxForms', 'settings'] as const;

/** Coursiva's own partner programme (docs/api/partners.md). */
export default function PartnersPage() {
  const t = useT();
  const summary = usePartnersSummary();
  const [section, setSection, sectionHref] = useSection(SECTIONS, 'applications');
  const [open, setOpen] = useState<string | null>(null);
  const s = summary.data;
  const kpis: [string, string][] | null = s
    ? [
        [t('kpi.applications'), num(s.applications)],
        [t('kpi.active'), num(s.activePartners)],
        [t('kpi.referrals'), num(s.referrals)],
        [t('kpi.owed'), cents(s.owed)],
        [t('kpi.held'), cents(s.held)],
        [t('kpi.paid'), cents(s.paid)],
      ]
    : null;

  return (
    <Screen max={1120} label={t('title')}>
      {summary.error ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="grid-kpi" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))' }}>
          {kpis
            ? kpis.map(([label, value]) => (
                <div key={label} className="card card--tight">
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value kpi-value--sm">
                    <CountUp value={value} />
                  </div>
                </div>
              ))
            : Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="card card--tight">
                  <Skeleton h={12} w="50%" />
                  <Skeleton h={22} w="60%" style={{ marginTop: 8 }} />
                </div>
              ))}
        </div>
      )}
      <SectionedPage
        sections={SECTIONS.map((id) => ({
          id,
          label: t(`sections.${id}`),
          ...(id === 'applications' && s?.applications ? { badge: s.applications, badgeLabel: t('kpi.applications') } : {}),
        }))}
        active={section}
        onChange={setSection}
        label={t('sections.nav')}
        href={sectionHref}
      >
        <SectionPanel active={section === 'applications'}>
          <PartnerTable applications onOpen={setOpen} />
        </SectionPanel>
        <SectionPanel active={section === 'partners'}>
          <PartnerTable applications={false} onOpen={setOpen} />
        </SectionPanel>
        <SectionPanel active={section === 'referrals'}>
          <ReferralsSection />
        </SectionPanel>
        <SectionPanel active={section === 'commissions'}>
          <CommissionsSection />
        </SectionPanel>
        <SectionPanel active={section === 'payouts'}>
          <PayoutsSection />
        </SectionPanel>
        <SectionPanel active={section === 'taxForms'}>
          <TaxFormsSection />
        </SectionPanel>
        <SectionPanel active={section === 'settings'}>
          <SettingsSection />
        </SectionPanel>
      </SectionedPage>
      {open && <PartnerDrawer id={open} onClose={() => setOpen(null)} />}
    </Screen>
  );
}
