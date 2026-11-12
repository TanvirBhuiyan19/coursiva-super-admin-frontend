import type { Meta, StoryObj } from '@storybook/react-vite';
import { BrandLogo } from './BrandLogo';

/** A neutral tile, as the integration cards use. */
const tile = {
  width: 32,
  height: 32,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: 'var(--pg2)',
  border: '1px solid var(--bd)',
} as const;

const meta = {
  title: 'UI/BrandLogo',
  component: BrandLogo,
  args: { brand: 'zapier', size: 20 },
} satisfies Meta<typeof BrandLogo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <span style={tile}>
      <BrandLogo {...args} />
    </span>
  ),
};

/** Standing alone, the logo is an image with a name. */
export const Titled: Story = { args: { brand: 'stripe', title: 'Stripe', size: 28 } };

/** Brand colours, marks drawn in the text colour where theirs would vanish on the tile, multicolour marks, and the monogram fallback. */
export const Gallery: Story = {
  render: (args) => (
    <div className="hstack wrap" style={{ gap: 8 }}>
      {['stripe', 'zoom', 'google-sheets', 'notion', 'x', 'mailchimp', 'google', 'microsoft-ads', 'Klaviyo', 'ActiveCampaign'].map((b) => (
        <span key={b} style={tile}>
          <BrandLogo {...args} brand={b} />
        </span>
      ))}
    </div>
  ),
};
