import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import es from "@finance/i18n/src/es.json";
import type { Language } from "@finance/i18n/src/languages";
import { loadCatalog } from "@finance/i18n/src/load";

// The catalogs live in `@finance/i18n`, shared with the public site; keys stay in parity across
// es/en (Constitution Principle III, enforced by that package's parity test). Only Spanish — the
// default — ships in the entry bundle: English is ~100 KB of JSON most sessions never use, so it is
// fetched by `setLanguage` when the account's language is English, the person picks it, or a screen
// needs both (the importer reads names in either language).
const i18n: I18nInstance = i18next.createInstance();
i18n.use(initReactI18next);
void i18n.init({
  resources: { es: { translation: es } },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  initAsync: false,
});

/** Makes a language's strings available without switching to it. */
export async function loadLanguage(lang: Language): Promise<void> {
  if (i18n.hasResourceBundle(lang, "translation")) return;
  i18n.addResourceBundle(lang, "translation", await loadCatalog(lang));
}

/** Loads a language if needed, then switches the app to it. */
export async function setLanguage(lang: Language): Promise<void> {
  await loadLanguage(lang);
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

export default i18n;
