import type { EmailLocale } from "../email-sender.port";
import { catalogFor } from "../i18n";
import { renderLayout, type RenderedEmail } from "./layout";

export type MfaCodeEmailPurpose = "LOGIN" | "ENROLL" | "STEP_UP";

export interface MfaCodeEmailInput {
  locale: EmailLocale;
  siteUrl: string;
  contact: string;
  purpose: MfaCodeEmailPurpose;
  code: string;
}

/** A second-factor code by email (specs/040). Wording by purpose; no financial data (FR-026). */
export function renderMfaCode(input: MfaCodeEmailInput): RenderedEmail {
  const t = catalogFor(input.locale).mfaCode;
  const p = t.purposes[input.purpose];
  return renderLayout({
    locale: input.locale,
    siteUrl: input.siteUrl,
    contact: input.contact,
    subject: p.subject,
    preheader: t.preheader,
    title: p.title,
    paragraphs: [p.body],
    code: input.code,
    notes: [t.expires, t.neverAsk, t.ignore],
  });
}
