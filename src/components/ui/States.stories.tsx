import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { ErrorState } from './States';

const meta = {
  title: 'UI/States',
  component: ErrorState,
  args: { error: new ApiError(500, 'Server Error'), onRetry: fn() },
} satisfies Meta<typeof ErrorState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ServerError: Story = {};
export const Forbidden: Story = { args: { error: new ApiError(403, 'This action is unauthorized.') } };
export const Offline: Story = { args: { error: new NetworkError() } };
export const Compact: Story = { args: { compact: true } };
