import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "@finance/i18n/src/languages";

export { DEFAULT_LANGUAGE, LANGUAGES, type Language };

/** The public pages. Most use ONE (English) slug in both languages (spec 031, clarify Q1); the
 * indicator pages are the deliberate exception (spec 033, clarify Q2): their address is what people
 * search for, so it is in the page's own language. */
export const PAGES = [
  "home",
  "about",
  "privacy",
  "privacyPolicy",
  "pricing",
  "faq",
  "ufValue",
  "dollarRate",
] as const;
export type Page = (typeof PAGES)[number];

/** The indicator pages (spec 033) and the currency each one shows, in pesos. */
export const RATE_PAGES = { ufValue: "CLF", dollarRate: "USD" } as const;
export type RatePage = keyof typeof RATE_PAGES;

/** Slug per language of the indicator pages. */
export const RATE_SLUGS: Record<RatePage, Record<Language, string>> = {
  ufValue: { es: "valor-uf", en: "uf-value" },
  dollarRate: { es: "dolar-observado", en: "dollar-rate" },
};

export function isRatePage(page: Page): page is RatePage {
  return page in RATE_PAGES;
}

const SLUG: Record<Exclude<Page, RatePage>, string> = {
  home: "",
  about: "about",
  privacy: "privacy",
  // The legal privacy policy (Ley 21.719); "privacy" is the plain-language explanation.
  privacyPolicy: "privacy-policy",
  pricing: "pricing",
  faq: "faq",
};

/** `/es/`, `/en/pricing/` — always prefixed by the language and ending with a slash (the static
 * output is one folder per page, so that IS the address a host serves). */
export function pagePath(lang: Language, page: Page): string {
  const slug = slugOf(page, lang);
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function slugOf(page: Page, lang: Language = DEFAULT_LANGUAGE): string {
  return isRatePage(page) ? RATE_SLUGS[page][lang] : SLUG[page];
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
