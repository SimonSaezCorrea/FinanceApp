import type { Language } from "./languages";

export type Catalog = Record<string, unknown>;

/**
 * One language's shared catalog, loaded on demand — its own chunk for a bundler, so an app can ship
 * only the language it starts in and fetch another when the person switches (or a screen needs
 * both, like the importer). `createI18n` (index.ts) still loads both up front, for the public
 * site's build and the tests.
 */
export function loadCatalog(lang: Language): Promise<Catalog> {
  const load = lang === "en" ? import("./en.json") : import("./es.json");
  return load.then((m) => m.default as Catalog);
}
