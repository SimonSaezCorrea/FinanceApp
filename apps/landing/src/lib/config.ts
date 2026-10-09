/**
 * The public site's build-time settings (all `PUBLIC_*`, inlined by Astro — safe to expose).
 * Defaults are the local development origins (spec 031, R13), so a plain `pnpm dev` works.
 */
const strip = (url: string) => url.trim().replace(/\/+$/, "");

/** The API, scheme + host + port (no `/api/v1`). */
export const API_URL = strip(import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001");

/** The signed-in app: where a sign-in lands and "Ir a la app" goes. */
export const APP_URL = strip(import.meta.env.PUBLIC_APP_URL ?? "http://localhost:5173");
