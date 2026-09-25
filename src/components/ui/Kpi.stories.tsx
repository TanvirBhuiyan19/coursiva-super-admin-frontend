import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kpi, KpiRow } from './Kpi';

const meta = {
  title: 'UI/Kpi',
  component: Kpi,
  args: { label: 'MRR', value: '$53.9K', delta: '+8.2%', deltaColor: 'var(--gFg)' },
} satisfies Meta<typeof Kpi>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSub: Story = { args: { sub: '11 paying tenants', delta: undefined } };
export const Row: Story = {
  render: () => (
    <KpiRow
      items={[
        { label: 'Tenants', value: '11', sub: '2 on trial' },
        { label: 'MRR', value: '$53.9K' },
        { label: 'Open tickets', value: '3' },
        { label: 'Uptime', value: '99.98%' },
      ]}
    />
  ),
};
