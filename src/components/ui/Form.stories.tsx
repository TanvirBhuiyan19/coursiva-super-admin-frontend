import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, FormError, Input, Textarea } from './Form';

const meta = {
  title: 'UI/Form',
  component: Field,
  args: { label: 'Work email', children: (p) => <Input {...p} type="email" placeholder="you@coursiva.io" /> },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'New tenants get a subdomain under this domain.' } };
export const WithError: Story = { args: { error: 'Enter a valid email address.' } };
export const Multiline: Story = { args: { label: 'Internal note', children: (p) => <Textarea {...p} rows={4} /> } };
export const LargeInput: Story = {
  args: { label: 'Tenant name', children: (p) => <Input {...p} size="lg" defaultValue="Harbor Music School" /> },
};
export const FormLevelError: Story = { render: () => <FormError>These credentials don’t match our records.</FormError> };
