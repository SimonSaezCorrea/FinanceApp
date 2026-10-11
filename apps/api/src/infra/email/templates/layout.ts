import type { EmailLocale } from "../email-sender.port";
import { catalogFor } from "../i18n";
import { escapeHtml, fill } from "./escape";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface LayoutInput {
  locale: EmailLocale;
  siteUrl: string;
  contact: string;
  subject: string;
  preheader: string;
  title: string;
  /** Paragraphs, already filled (raw text: escaped here for HTML). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Smaller paragraphs after the button. */
  notes?: string[];
}

// Email clients ignore stylesheets and CSS variables: tables and inline styles only. Light
// palette (most inboxes are light), the brand's deep teal for the button and links.
const INK = "#0e1f22";
const MUTED = "#5a6f72";
const BRAND = "#0e3b40";
const LINE = "#d9e3e3";
/** The card's own tone: fik's light page ground, so the message stands apart from the inbox's
 * white without painting anything around it (the inbox's own background shows through). */
const CARD = "#f4f7f8";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function paragraph(text: string, size = 15, color = INK): string {
  return `<p style="margin:0 0 16px;font:${size}px/1.55 ${FONT};color:${color}">${escapeHtml(text)}</p>`;
}

/** The content id of the logo attached to every email (the sender attaches it). */
export const EMAIL_LOGO_CONTENT_ID = "fik-logo";

/** Shared frame of every email: logo, title, body, an optional button, footer with the contact. */
export function renderLayout(input: LayoutInput): RenderedEmail {
  const t = catalogFor(input.locale).layout;
  const contact = fill(t.contact, { contact: input.contact }, false);
  // Inline image attached to the email itself (see `EMAIL_LOGO_CONTENT_ID`): it shows in any inbox
  // without fetching it from the site.
  const logo = `cid:${EMAIL_LOGO_CONTENT_ID}`;

  const button = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:${BRAND};border-radius:10px">
<a href="${escapeHtml(input.button.url)}" style="display:inline-block;padding:13px 22px;font:600 15px ${FONT};color:#ffffff;text-decoration:none">${escapeHtml(input.button.label)}</a>
</td></tr></table>
${paragraph(t.buttonFallback, 13, MUTED)}
<p style="margin:0 0 20px;font:13px/1.5 ${FONT};word-break:break-all"><a href="${escapeHtml(input.button.url)}" style="color:${BRAND}">${escapeHtml(input.button.url)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:14px">
<tr><td style="padding:28px 32px 8px"><img src="${escapeHtml(logo)}" width="120" alt="fik" style="display:block;border:0;height:auto"></td></tr>
<tr><td style="padding:8px 32px 8px">
<h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:${INK}">${escapeHtml(input.title)}</h1>
${input.paragraphs.map((p) => paragraph(p)).join("\n")}
${button}
${(input.notes ?? []).map((n) => paragraph(n, 13, MUTED)).join("\n")}
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid ${LINE}">
${paragraph(t.footer, 12, MUTED)}
${paragraph(contact, 12, MUTED)}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    input.title,
    "",
    ...input.paragraphs.flatMap((p) => [p, ""]),
    ...(input.button ? [`${input.button.label}: ${input.button.url}`, ""] : []),
    ...(input.notes ?? []).flatMap((n) => [n, ""]),
    "—",
    t.footer,
    contact,
  ].join("\n");

  return { subject: input.subject, html, text };
}
