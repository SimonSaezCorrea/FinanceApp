import type { EmailLocale } from "../email-sender.port";
import { catalogFor } from "../i18n";
import { fill } from "./escape";
import { renderLayout, type RenderedEmail } from "./layout";

export interface VerifyEmailInput {
  locale: EmailLocale;
  siteUrl: string;
  contact: string;
  /** The address being confirmed (shown back so the person knows which one). */
  address: string;
  link: string;
}

/** "Confirma tu correo" — at registration and when changing the address (specs/032 US1). */
export function renderVerifyEmail(input: VerifyEmailInput): RenderedEmail {
  const t = catalogFor(input.locale).verifyEmail;
  return renderLayout({
    locale: input.locale,
    siteUrl: input.siteUrl,
    contact: input.contact,
    subject: t.subject,
    preheader: t.preheader,
    title: t.title,
    paragraphs: [fill(t.body, { address: input.address }, false)],
    button: { label: t.button, url: input.link },
    notes: [t.expires, t.ignore],
  });
}
