import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { avatarColor } from '@/lib/format';
import { Avatar, Bar, ConfirmButton, Empty, Skeleton, SkeletonRows, Spinner } from './Misc';

const meta = {
  title: 'UI/Misc',
  component: ConfirmButton,
  args: { children: 'Suspend tenant', onConfirm: fn() },
} satisfies Meta<typeof ConfirmButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two-step destructive action: click once to arm, again to confirm. */
export const Confirm: Story = {};
export const ConfirmPending: Story = { args: { pending: true } };

export const Bars: Story = {
  render: () => (
    <div className="stack" style={{ maxWidth: 320, gap: 12 }}>
      <Bar value={42} label="Storage used" />
      <Bar value={76} tone="warn" label="Seats used" />
      <Bar value={94} tone="bad" size="lg" label="API quota" />
    </div>
  ),
};

export const Avatars: Story = {
  render: () => (
    <div className="hstack" style={{ gap: 8 }}>
      {['SO', 'PS', 'NK', 'LC', 'OH', 'TO'].map((text) => (
        <Avatar key={text} text={text} color={avatarColor(text)} />
      ))}
      <Avatar text="AC" color={avatarColor('AC')} round size={36} />
    </div>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <Empty
      action={
        <button type="button" className="btn">
          Clear filters
        </button>
      }
    >
      No tenants match these filters.
    </Empty>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="stack" style={{ maxWidth: 420, gap: 16 }}>
      <Spinner size={18} />
      <Skeleton h={22} w="60%" />
      <SkeletonRows rows={4} />
    </div>
  ),
};
