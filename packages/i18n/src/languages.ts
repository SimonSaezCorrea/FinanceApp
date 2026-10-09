/** The languages Cuadra ships. The app and the public site both default to Spanish.
 * A module of its own so a page script can know them without loading the catalogs. */
export const LANGUAGES = ["es", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "es";
