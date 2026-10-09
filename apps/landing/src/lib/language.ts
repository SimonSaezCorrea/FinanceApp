import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@finance/i18n/src/languages";

export { DEFAULT_LANGUAGE, LANGUAGES, type Language };

/** The public pages, by the (English) slug they use in BOTH languages (spec 031, clarify Q1). */
export const PAGES = ["home", "about", "privacy", "pricing", "faq"] as const;
export type Page = (typeof PAGES)[number];

const SLUG: Record<Page, string> = {
  home: "",
  about: "about",
  privacy: "privacy",
  pricing: "pricing",
  faq: "faq",
};

/** `/es/`, `/en/pricing/` — always prefixed by the language and ending with a slash (the static
 * output is one folder per page, so that IS the address a host serves). */
export function pagePath(lang: Language, page: Page): string {
  const slug = SLUG[page];
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function slugOf(page: Page): string {
  return SLUG[page];
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** The language the root `/` sends a visitor to: English when the browser's FIRST preference is
 * English, Spanish otherwise (the site's default market is Chile). */
export function pickLanguage(preferred: readonly string[] | undefined): Language {
  const first = preferred?.[0]?.toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : DEFAULT_LANGUAGE;
}

/** The Spanish addresses the site had before specs/031, each kept as a permanent redirect. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/precios": pagePath("es", "pricing"),
  "/nosotros": pagePath("es", "about"),
  "/privacidad": pagePath("es", "privacy"),
  "/preguntas": pagePath("es", "faq"),
};

export function legacyTarget(path: string): string | null {
  return LEGACY_REDIRECTS[path.replace(/\/+$/, "")] ?? null;
}
