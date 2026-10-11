import type { EmailLocale } from "../email-sender.port";
import { catalogFor } from "../i18n";
import { renderLayout, type RenderedEmail } from "./layout";

export interface ResetPasswordInput {
  locale: EmailLocale;
  siteUrl: string;
  contact: string;
  link: string;
}

/** "Recupera tu cuenta" — the link to choose a new password (specs/032 US2). */
export function renderResetPassword(input: ResetPasswordInput): RenderedEmail {
  const t = catalogFor(input.locale).resetPassword;
  return renderLayout({
    locale: input.locale,
    siteUrl: input.siteUrl,
    contact: input.contact,
    subject: t.subject,
    preheader: t.preheader,
    title: t.title,
    paragraphs: [t.body],
    button: { label: t.button, url: input.link },
    notes: [t.expires, t.sessions, t.ignore],
  });
}
