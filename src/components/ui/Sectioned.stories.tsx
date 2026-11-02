import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';
import { Toggle } from './Controls';
import { Input } from './Form';
import { Card } from './Layout';
import { SectionedPage, SectionPanel, SettingRow, WhereRead, type SectionNavItem } from './Sectioned';

type Id = 'platform' | 'security' | 'email' | 'maintenance';
const SECTIONS: SectionNavItem<Id>[] = [
  {
    id: 'platform',
    label: 'Platform',
    icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
    badge: 1,
    badgeLabel: '1 setting changed from its default',
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    badge: 2,
    badgeLabel: '2 settings changed from their defaults',
  },
  { id: 'email', label: 'Email', icon: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6' },
  { id: 'maintenance', label: 'Maintenance', icon: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4z' },
];

const meta = {
  title: 'UI/Sectioned',
  component: SectionedPage<Id>,
  args: { sections: SECTIONS, active: 'platform', onChange: () => undefined, label: 'Settings sections', children: null },
} satisfies Meta<typeof SectionedPage<Id>>;
export default meta;
type Story = StoryObj<typeof meta>;

function SectionBody({ id }: { id: Id }) {
  const [sso, setSso] = useState(false);
  const label = SECTIONS.find((s) => s.id === id)?.label ?? id;
  return (
    <>
      <Card title={label} sub="Identity and defaults every workspace inherits." right={<Badge tone="accent">1 changed from default</Badge>}>
        <SettingRow label="Platform name" help="Shown in the console and platform emails." changed>
          {(p) => <Input {...p} defaultValue="Coursiva Learning" />}
        </SettingRow>
        <SettingRow label="Support email" help="Offered on error pages." error="Enter a valid support email address.">
          {(p) => <Input {...p} type="email" defaultValue="support@" />}
        </SettingRow>
        <SettingRow label="Enforce SSO" help="Staff can only sign in through the identity provider." kind="group">
          {() => <Toggle label="Enforce SSO" on={sso} onChange={setSso} />}
        </SettingRow>
        <div className="hstack wrap" style={{ gap: 8, paddingTop: 14 }}>
          <button type="button" className="btn btn--primary">
            Save {label.toLowerCase()}
          </button>
          <button type="button" className="btn" disabled>
            Discard
          </button>
        </div>
      </Card>
      <WhereRead
        summary="Where these values are read"
        items={[
          { key: 'name', label: 'Platform name', effect: 'Console title, platform emails and schools that keep platform branding' },
          { key: 'email', label: 'Support email', effect: 'Billing emails, error pages and the “no such workspace” screen' },
        ]}
      />
    </>
  );
}

/** Section nav with links (each section is a URL) and count badges; the picker replaces the nav on narrow screens. */
export const Default: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<Id>(args.active);
    return (
      <SectionedPage {...args} active={active} onChange={setActive} href={(id) => `?section=${id}`}>
        <SectionBody id={active} />
      </SectionedPage>
    );
  },
};

/** Without `href` the nav items are buttons. */
export const Buttons: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<Id>('security');
    return (
      <SectionedPage {...args} active={active} onChange={setActive}>
        <SectionBody id={active} />
      </SectionedPage>
    );
  },
};

/** With unsaved changes, switching sections asks first. */
export const ConfirmSwitch: Story = {
  render: function Render(args) {
    const [active, setActive] = useState<Id>('platform');
    return (
      <SectionedPage {...args} active={active} onChange={setActive} confirmSwitch>
        <SectionBody id={active} />
      </SectionedPage>
    );
  },
};

type PanelId = 'keys' | 'webhooks' | 'failed';
const PANEL_SECTIONS: SectionNavItem<PanelId>[] = [
  { id: 'keys', label: 'API keys' },
  { id: 'webhooks', label: 'Webhook endpoints' },
  { id: 'failed', label: 'Failed deliveries', badge: 3, badgeLabel: '3 failed deliveries', badgeTone: 'bad' },
];

/**
 * Content sections without forms, via `SectionPanel`: each is mounted on first view and then kept (hidden), so a typed
 * draft survives switching. A `warn` / `bad` badge flags a section that needs attention.
 */
export const Panels: StoryObj<typeof SectionedPage<PanelId>> = {
  args: { sections: PANEL_SECTIONS, active: 'keys', onChange: () => undefined, label: 'API sections', children: null },
  render: function Render(args) {
    const [active, setActive] = useState<PanelId>('keys');
    return (
      <SectionedPage {...args} active={active} onChange={setActive}>
        {PANEL_SECTIONS.map((s) => (
          <SectionPanel key={s.id} active={active === s.id}>
            <Card title={s.label}>
              <Input aria-label={`${s.label} note`} placeholder="Type, switch sections, come back" />
            </Card>
          </SectionPanel>
        ))}
      </SectionedPage>
    );
  },
};

export const Rows: Story = {
  render: () => (
    <Card title="Signup & provisioning">
      <SettingRow label="Trial length (days)" help="0–90 days. 0 = no free trial." changed>
        {(p) => <Input {...p} type="number" defaultValue={21} />}
      </SettingRow>
      <SettingRow label="Public sign-up" help="When off, the marketing site refuses sign-ups." kind="group">
        {() => <Toggle label="Public sign-up" on />}
      </SettingRow>
    </Card>
  ),
};
