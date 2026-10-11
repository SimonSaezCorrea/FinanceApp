import type { EmailLocale } from "../email-sender.port";
import { catalogFor } from "../i18n";
import { fill } from "./escape";
import { renderLayout, type RenderedEmail } from "./layout";

export type SecurityNoticeKind =
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "PASSKEY_ADDED"
  | "PASSKEY_REMOVED"
  | "EMAIL_CHANGED"
  | "ACCOUNT_DELETED";

export interface SecurityNoticeInput {
  locale: EmailLocale;
  siteUrl: string;
  contact: string;
  kind: SecurityNoticeKind;
  occurredAt: Date;
  /** The passkey's name, or the new address for EMAIL_CHANGED. */
  detail?: string;
}

/** When it happened, in Chile's time zone and the account's language. */
export function formatNoticeDate(at: Date, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(at);
}

/** A security notice (specs/032 US3): what happened, when, and what to do if it wasn't you.
 * Informational only — no button that acts on the account. */
export function renderSecurityNotice(input: SecurityNoticeInput): RenderedEmail {
  const t = catalogFor(input.locale).securityNotice;
  const kind = t.kinds[input.kind];
  return renderLayout({
    locale: input.locale,
    siteUrl: input.siteUrl,
    contact: input.contact,
    subject: kind.subject,
    preheader: kind.title,
    title: kind.title,
    paragraphs: [
      fill(kind.body, { detail: input.detail ?? "" }, false),
      fill(t.when, { date: formatNoticeDate(input.occurredAt, input.locale) }, false),
    ],
    notes: [fill(t.notYou, { site: input.siteUrl, contact: input.contact }, false)],
  });
}
