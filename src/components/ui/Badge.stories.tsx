import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, Dot } from './Badge';

const TONES = ['good', 'warn', 'bad', 'info', 'flat', 'accent'] as const;

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'Active', tone: 'good' },
  argTypes: { tone: { control: 'inline-radio', options: TONES } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Pill: Story = { args: { pill: true } };
export const ExtraSmall: Story = { args: { xs: true, pill: true } };

/** Every tone, as used for plan, status, health and severity. */
export const Tones: Story = {
  render: (args) => (
    <div className="hstack wrap" style={{ gap: 8 }}>
      {TONES.map((tone) => (
        <Badge key={tone} {...args} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};

export const Dots: Story = {
  render: () => (
    <div className="hstack" style={{ gap: 12 }}>
      {TONES.map((tone) => (
        <Dot key={tone} tone={tone} label={tone} />
      ))}
    </div>
  ),
};
