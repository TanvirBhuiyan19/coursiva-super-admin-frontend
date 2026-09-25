import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import i18next from 'eslint-plugin-i18next';
import storybook from 'eslint-plugin-storybook';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...storybook.configs['flat/recommended'],
  {
    ignores: [
      'dist',
      'dist-perf',
      'coverage',
      'playwright-report',
      'test-results',
      'public/mockServiceWorker.js',
      'storybook-static',
      '!.storybook',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, jsxA11y.flatConfigs.recommended, prettier],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // noUncheckedIndexedAccess makes `!` necessary after explicit length/lookup checks.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }],
      // Typed fetch helpers (`api.get<T>()`) intentionally use a single type parameter.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      // Architecture boundaries: features talk to each other only through their public surface
      // (`@/features/x`, `/api`, `/types`, and auth's Can/useCan/permissions), and app code never
      // imports the mock backend (so it can't leak into production bundles).
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/components/*', '@/features/*/pages/*', '@/features/*/mock', '@/features/*/*/**'],
              message:
                'Import another feature only through its public surface: @/features/<name>, /api, /types (or auth Can/useCan/permissions).',
            },
            { group: ['@/mocks', '@/mocks/*'], message: 'App code must not import the mock backend (only mock.ts files and tests may).' },
          ],
        },
      ],
    },
  },
  {
    // i18n: user-facing text in JSX must come from a message catalogue (`t()` from lib/i18n or a feature's i18n.ts).
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx', '**/*.stories.tsx', 'src/test/**', 'src/mocks/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: [
              'title',
              'label',
              'sub',
              'hint',
              'placeholder',
              'alt',
              'aria-label',
              'aria-description',
              'noun',
              'description',
              'message',
            ],
          },
          words: { exclude: ['[0-9!-/:-@[-`{-~\s·—–…×→←↑↓✓•]+', '[A-Z_-]+'] },
        },
      ],
    },
  },
  {
    // Storybook config and stories aren't hot-reloaded app modules.
    files: ['.storybook/**', '**/*.stories.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Build tooling and CLI scripts print to the console by design.
    files: ['scripts/**', 'build/**'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    // The mock layer and tests are allowed to reach into mocks and feature internals.
    files: ['src/mocks/**', 'src/features/**/mock.ts', '**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Mock handlers validate untrusted request bodies, so "unnecessary" null checks are intentional.
    files: ['src/mocks/**', 'src/features/**/mock.ts'],
    rules: { '@typescript-eslint/no-unnecessary-condition': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/mocks/**', 'e2e/**', 'src/app/router.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off', 'react-refresh/only-export-components': 'off' },
  },
);
