/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { precompress } from './build/precompress';

/** Long-lived vendor chunks: they change rarely, so browsers keep them cached across app deploys. */
const VENDOR_GROUPS = [
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
  { name: 'vendor-router', test: /node_modules[\\/](react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/, priority: 20 },
  { name: 'vendor-data', test: /node_modules[\\/](@tanstack|zustand)[\\/]/, priority: 20 },
  // Forms libraries only load with screens that have forms (not on the critical path).
  { name: 'vendor-forms', test: /node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/, priority: 20 },
];

/**
 * React Compiler scope: every app source file except those using react-hook-form, whose `useForm` object
 * (`watch()`, `formState`) is mutable and not compiler-safe. Those components keep React's default rendering.
 */
const FORM_USAGE = /react-hook-form|useZodForm|UseFormReturn|\bform\.(watch|register|formState|setValue|getValues|control|reset)\b/;

function compilerSources(filename: string) {
  const path = filename.replaceAll('\\', '/');
  if (!path.includes('/src/') || path.includes('/node_modules/')) return false;
  if (/\.(test|spec)\.tsx?$/.test(path)) return false;
  try {
    return !FORM_USAGE.test(readFileSync(filename, 'utf8'));
  } catch {
    return false;
  }
}

/** Preloads the Latin body/display font files so they download in parallel with the CSS (no late text swap). */
function preloadFonts(): Plugin {
  return {
    name: 'coursiva:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        return Object.keys(ctx.bundle ?? {})
          .filter((file) => /(instrument-sans|bricolage-grotesque)-latin-wght-normal-[\w-]+\.woff2$/.test(file))
          .map((file) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: `/${file}`, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    preloadFonts(),
    precompress(),
    // React Compiler: automatic memoization of components and hooks (fewer re-renders, less blocking time).
    // Skipped under Vitest (Babel per lazily-imported page slows tests); Playwright e2e verifies the compiled app.
    ...(process.env.VITEST ? [] : [babel({ presets: [reactCompilerPreset({ sources: compilerSources })] })]),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    // Hidden: maps are generated for error-report symbolication but not referenced by the shipped files.
    sourcemap: 'hidden',
    // Any chunk above this is a regression worth investigating (budgets enforced by scripts/check-bundle.mjs).
    chunkSizeWarningLimit: 250,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: VENDOR_GROUPS },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    coverage: { provider: 'v8', include: ['src/**/*.{ts,tsx}'], exclude: ['src/mocks/**', 'src/test/**', '**/*.test.*'] },
  },
});
