import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CommitNumberInput } from './CommitNumberInput';

const meta = {
  title: 'UI/CommitNumberInput',
  component: CommitNumberInput,
  args: { value: 14, min: 7, max: 60, label: 'Trial length (days)', rangeMessage: '7–60 days', onCommit: () => {}, suffix: 'days' },
} satisfies Meta<typeof CommitNumberInput>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Commits on blur/Enter; out-of-range values show the range message and revert. */
export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <CommitNumberInput {...args} value={value} onCommit={setValue} />;
  },
};
export const Currency: Story = {
  args: { value: 399, min: 0, max: 10000, label: 'Growth price', rangeMessage: '$0–$10,000', prefix: '$', suffix: undefined },
};
export const Disabled: Story = { args: { disabled: true } };
