import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Chip, ChipGroup, Seg, Select, Toggle, ToggleRow } from './Controls';

const meta = { title: 'UI/Controls', component: Chip, args: { children: 'Growth' } } satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chips: Story = {
  render: () => (
    <div className="hstack" style={{ gap: 8 }}>
      <Chip on>Selected</Chip>
      <Chip>Idle</Chip>
      <Chip accent on>
        Accent
      </Chip>
      <Chip disabled>Disabled</Chip>
    </div>
  ),
};

export const ChipGroupFilter: Story = {
  render: function Render() {
    const [value, setValue] = useState<'all' | 'Launch' | 'Growth' | 'Scale'>('all');
    return <ChipGroup label="Filter by plan" options={[['all', 'All'], 'Launch', 'Growth', 'Scale']} value={value} onChange={setValue} />;
  },
};

export const Segmented: Story = {
  render: function Render() {
    const [value, setValue] = useState<'Light' | 'Dark'>('Light');
    return (
      <div style={{ width: 200 }}>
        <Seg label="Interface theme" options={['Light', 'Dark']} value={value} onChange={setValue} />
      </div>
    );
  },
};

export const Toggles: Story = {
  render: function Render() {
    const [on, setOn] = useState(true);
    return (
      <div className="stack" style={{ maxWidth: 420, gap: 12 }}>
        <Toggle label="Enable flag" on={on} onChange={setOn} />
        <ToggleRow
          label="Auto-suspend after failed dunning"
          sub="Suspend tenant access once all retries are exhausted."
          on={on}
          onChange={setOn}
        />
        <ToggleRow label="Disabled" on={false} disabled />
      </div>
    );
  },
};

export const SelectBox: Story = {
  render: function Render() {
    const [value, setValue] = useState<'3' | '4' | '5'>('3');
    return (
      <Select
        label="Payment retries"
        value={value}
        onChange={setValue}
        options={[
          ['3', '3 retries'],
          ['4', '4 retries'],
          ['5', '5 retries'],
        ]}
      />
    );
  },
};
