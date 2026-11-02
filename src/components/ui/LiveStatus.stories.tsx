import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveStatus } from './LiveStatus';

const meta = {
  title: 'UI/LiveStatus',
  component: LiveStatus,
  args: { state: 'live', updatedAt: Date.now() },
} satisfies Meta<typeof LiveStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const Updating: Story = { args: { state: 'updating' } };
export const Offline: Story = { args: { state: 'offline' } };
export const Paused: Story = { args: { state: 'paused' } };
