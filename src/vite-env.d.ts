/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_PREFIX?: string;
  readonly VITE_ENABLE_MOCKS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_VITALS_ENDPOINT?: string;
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
