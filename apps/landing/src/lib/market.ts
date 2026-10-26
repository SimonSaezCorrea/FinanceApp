import { t } from "../i18n";
import type { Language } from "./language";

/**
 * The market the public site speaks to (ISO 3166-1 alpha-2). Titles and copy that name the country
 * read it from here and from `landing.market.<code>`, never as "Chile" written into a string, so a
 * second country is this constant (or one site per market) plus a catalog entry.
 */
export const SITE_MARKET = "CL";

/** The market's name in the page language ("Chile"). */
export function marketName(lang: Language): string {
  return t(lang, `landing.market.${SITE_MARKET}`);
}

/** A page's meta description, with the market filled in where it is named. */
export function metaDescription(lang: Language, key: string): string {
  return t(lang, `landing.meta.${key}.description`, { country: marketName(lang) });
}

/** A page's `<title>` from `landing.meta.<key>.title`, with the market filled in where it is named. */
export function metaTitle(lang: Language, key: string): string {
  return t(lang, `landing.meta.${key}.title`, { country: marketName(lang) });
}
