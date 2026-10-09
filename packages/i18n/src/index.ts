import i18next, { type Module, type Resource, type i18n as I18nInstance } from "i18next";

import en from "./en.json";
import es from "./es.json";

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from "./languages";

export { DEFAULT_LANGUAGE, LANGUAGES, type Language };

/** The shared catalogs: everything both the app and the public site may render (Principle III). */
export const catalogs = { es, en } as const;

export interface CreateI18nOptions {
  lng?: Language;
  /** Extra keys merged over the shared catalog per language (the public site's `landing.*`). */
  extra?: Partial<Record<Language, Record<string, unknown>>>;
  /** i18next plugins to `use()` before init — `initReactI18next` for React consumers. */
  plugins?: Module[];
}

/**
 * A NEW i18next instance with the shared catalogs (plus `extra`), initialised synchronously so
 * it can render on the first pass — on the server at build time as well as in the browser.
 */
export function createI18n({
  lng = DEFAULT_LANGUAGE,
  extra = {},
  plugins = [],
}: CreateI18nOptions = {}): I18nInstance {
  const resources: Resource = {};
  for (const language of LANGUAGES) {
    resources[language] = {
      translation: { ...catalogs[language], ...(extra[language] ?? {}) },
    };
  }
  const instance = i18next.createInstance();
  for (const plugin of plugins) instance.use(plugin);
  void instance.init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
