import { createI18n } from "@finance/i18n";
import type { i18n as I18nInstance } from "i18next";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import type { Language } from "../lib/language";
import en from "./en.json";
import { LangProvider } from "./lang";
import es from "./es.json";

/** The public site's own strings (`landing.*`), merged over the shared catalog per language. */
export const landingCatalogs = { es, en } as const;

const instances = new Map<Language, I18nInstance>();

/** One i18next instance per language, created on first use: a page is ONE language, decided by its
 * address, so nothing ever switches language at runtime. */
export function getI18n(lang: Language): I18nInstance {
  let instance = instances.get(lang);
  if (!instance) {
    instance = createI18n({ lng: lang, extra: landingCatalogs });
    instances.set(lang, instance);
  }
  return instance;
}

/** Translate outside React (Astro frontmatter: titles, meta, nav labels). */
export function t(lang: Language, key: string, options?: Record<string, unknown>): string {
  return getI18n(lang).t(key, options);
}

export { useLang } from "./lang";

/** Wraps React content rendered on a page — at build time or in the access panel — with that
 * page's translations and language. */
export function I18nRoot({ lang, children }: Readonly<{ lang: Language; children: ReactNode }>) {
  return (
    <I18nextProvider i18n={getI18n(lang)}>
      <LangProvider lang={lang}>{children}</LangProvider>
    </I18nextProvider>
  );
}
