import { defineRouting } from "next-intl/routing";

/**
 * Supported locale codes. To add a language: extend this tuple, add `messages/<code>.json`,
 * and typecheck will guide any `switch (locale)` exhaustiveness if you use `Locale`.
 */
export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

/**
 * Routing defaults:
 * - defaultLocale `es`: Spanish-first product; when no cookie/prefix match, URLs and copy default here.
 * - localeDetection (default true): negotiates from NEXT_LOCALE cookie, Accept-Language, then defaultLocale.
 */
export const routing = defineRouting({
  locales: [...locales],
  defaultLocale: "es",
  localePrefix: "always",
});
