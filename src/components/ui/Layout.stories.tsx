import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';
import { Card, TRow } from './Layout';

const meta = {
  title: 'UI/Layout',
  component: Card,
  args: { title: 'Plan entitlements', sub: 'What each plan includes', children: <p className="t-sm muted">Card body content.</p> },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CardDefault: Story = {};
export const CardWithAction: Story = { args: { right: <Badge tone="info">Only you · this device</Badge> } };
export const Tight: Story = { args: { tight: true } };

export const TableRows: Story = {
  render: () => (
    <Card flush title="Tenants">
      <div role="table" aria-label="Tenants">
        <div role="rowgroup">
          <TRow head cols="2fr 1fr 1fr">
            <div role="columnheader">Tenant</div>
            <div role="columnheader">Plan</div>
            <div role="columnheader">MRR</div>
          </TRow>
        </div>
        <div role="rowgroup">
          {[
            ['Amplify Coaching', 'Growth', '$399'],
            ['Nordic Yoga School', 'Scale', '$1,290'],
            ['Bloom Floristry Courses', 'Launch', '$99'],
          ].map(([name, plan, mrr], i) => (
            <TRow key={name} cols="2fr 1fr 1fr" selected={i === 1}>
              <div role="cell">{name}</div>
              <div role="cell">{plan}</div>
              <div role="cell">{mrr}</div>
            </TRow>
          ))}
        </div>
      </div>
    </Card>
  ),
};
