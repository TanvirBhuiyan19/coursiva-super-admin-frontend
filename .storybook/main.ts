import type { StorybookConfig } from '@storybook/react-vite';

// Build-only plugins from vite.config.ts that have no place in the component catalogue.
const SKIP_PLUGINS = new Set(['coursiva:precompress', 'coursiva:preload-fonts']);

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)', '../src/**/*.mdx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  typescript: { reactDocgen: 'react-docgen-typescript' },
  viteFinal(config) {
    config.plugins = (config.plugins ?? []).flat().filter((p) => !(p && typeof p === 'object' && 'name' in p && SKIP_PLUGINS.has(p.name)));
    // The app's vendor chunking and sourcemap settings target production deploys, not Storybook.
    config.build = { ...config.build, sourcemap: false, rolldownOptions: undefined, rollupOptions: undefined };
    return config;
  },
};
export default config;
