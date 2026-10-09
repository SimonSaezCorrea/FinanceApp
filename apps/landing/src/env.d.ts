/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Absent in a plain `pnpm dev`: `src/lib/config.ts` falls back to the local origins. */
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The font packages are CSS-only side-effect imports with no type declarations.
declare module "@fontsource-variable/geist";
declare module "@fontsource-variable/inter";
