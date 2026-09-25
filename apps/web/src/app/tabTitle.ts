/**
 * What a route puts in the browser tab, as its `handle`. `title` is an i18n key; `signedInTitle`
 * overrides it once the viewer is signed in — `/` is the landing for a visitor (no section, just
 * the brand) and the Panel for a user.
 */
export interface TitleHandle {
  title?: string;
  signedInTitle?: string;
}

/** Tab title for a section: "Cuadra · Precios"; the brand alone when there is no section. */
export function tabTitle(brand: string, section?: string | null) {
  return section ? `${brand} · ${section}` : brand;
}
