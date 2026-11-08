import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@finance/i18n/src/languages";

export { DEFAULT_LANGUAGE, LANGUAGES, type Language };

/** The public pages. Most use ONE (English) slug in both languages (spec 031, clarify Q1); the
 * indicator pages (spec 033, clarify Q2) and the guides section (spec 035) are the deliberate
 * exceptions: their address is what people search for, so it is in the page's own language. */
export const PAGES = [
  "home",
  "about",
  "privacy",
  "privacyPolicy",
  "pricing",
  "faq",
  "ufValue",
  "dollarRate",
  "guides",
  "editorial",
  "releaseNotes",
  "ai",
] as const;
export type Page = (typeof PAGES)[number];

/** The indicator pages (spec 033) and the currency each one shows, in pesos. */
export const RATE_PAGES = { ufValue: "CLF", dollarRate: "USD" } as const;
export type RatePage = keyof typeof RATE_PAGES;

/** The pages whose slug is in the page's own language. */
export type LocalizedPage = RatePage | "guides" | "editorial" | "releaseNotes";

/** Slug per language of the localized pages. Same pairs as `LOCALIZED_PAIRS` in astro.config.mjs. */
export const LOCALIZED_SLUGS: Record<LocalizedPage, Record<Language, string>> = {
  ufValue: { es: "valor-uf", en: "uf-value" },
  dollarRate: { es: "dolar-observado", en: "dollar-rate" },
  guides: { es: "guias", en: "guides" },
  // How the guides are written (Confianza · Política editorial).
  editorial: { es: "como-escribimos", en: "how-we-write" },
  // What changed in each deploy (spec 038).
  releaseNotes: { es: "novedades", en: "whats-new" },
};

export function isLocalizedPage(page: Page): page is LocalizedPage {
  return page in LOCALIZED_SLUGS;
}

export function isRatePage(page: Page): page is RatePage {
  return page in RATE_PAGES;
}

const SLUG: Record<Exclude<Page, LocalizedPage>, string> = {
  home: "",
  about: "about",
  privacy: "privacy",
  // The legal privacy policy (Ley 21.719); "privacy" is the plain-language explanation.
  privacyPolicy: "privacy-policy",
  pricing: "pricing",
  faq: "faq",
  // The site summary for AI assistants, shown to people (the same text as /llms.txt).
  ai: "ai",
};

/** `/`, `/en/`, `/es/pricing/` — prefixed by the language and ending with a slash (the static
 * output is one folder per page, so that IS the address a host serves). The Spanish home is the
 * root itself: the domain's home page must be a real page (not a redirect) for search engines to
 * read the site's name and show it with its sections; `/es/` is a permanent redirect to it. */
export function pagePath(lang: Language, page: Page): string {
  if (page === "home" && lang === DEFAULT_LANGUAGE) return "/";
  const slug = slugOf(page, lang);
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function slugOf(page: Page, lang: Language = DEFAULT_LANGUAGE): string {
  return isLocalizedPage(page) ? LOCALIZED_SLUGS[page][lang] : SLUG[page];
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** Addresses the site had before, each kept as a permanent redirect: the Spanish ones from before
 * specs/031, and `/es/`, the Spanish home until it moved to the root. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/es": pagePath("es", "home"),
  "/precios": pagePath("es", "pricing"),
  "/nosotros": pagePath("es", "about"),
  "/privacidad": pagePath("es", "privacy"),
  "/preguntas": pagePath("es", "faq"),
};

export function legacyTarget(path: string): string | null {
  return LEGACY_REDIRECTS[path.replace(/\/+$/, "")] ?? null;
}
