/**
 * Who stands behind the site, for structured data (the home's `Organization`, a guide's author).
 * One place, so the founder and the contact never read differently on two pages.
 */

/**
 * Other names the brand goes by: "fik" alone collides with unrelated brands in search, so the
 * structured data also lists the domain's name and the descriptive ones (es/en).
 */
export const BRAND_NAMES: readonly string[] = ["mifik", "fik finanzas", "fik finance"];

/** The address every person writes to (also in the privacy policy and security.txt). */
export const CONTACT_EMAIL = "contacto@mifik.cl";

/**
 * The brand's public profiles (`sameAs`). Only real, live URLs: the source repository for now; the
 * social profiles join here once they exist (ClickUp "Crear perfiles oficiales de fik").
 */
export const BRAND_PROFILES: readonly string[] = ["https://github.com/SimonSaezCorrea/FinanceApp"];

/** The founder, who also writes the guides. */
export const FOUNDER = {
  name: "Simón Sáez",
  profiles: ["https://www.linkedin.com/in/simon-saez"],
} as const;
