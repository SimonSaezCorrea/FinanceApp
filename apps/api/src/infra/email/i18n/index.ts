import type { EmailLocale } from "../email-sender.port";
import { en } from "./en";
import { es, type EmailCatalog } from "./es";

export type { EmailCatalog };

const CATALOGS: Record<EmailLocale, EmailCatalog> = { es, en };

/** The account's language decides the email's (FR-003); anything unknown falls back to Spanish. */
export function catalogFor(locale: string): EmailCatalog {
  return CATALOGS[locale as EmailLocale] ?? es;
}

export function emailLocale(locale: string): EmailLocale {
  return locale === "en" ? "en" : "es";
}
