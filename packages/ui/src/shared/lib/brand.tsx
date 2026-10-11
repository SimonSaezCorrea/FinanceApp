import { Fragment, type ReactNode } from "react";

/**
 * The product name written as a word (not the logo) always goes in italics: "fik". Catalog
 * strings keep the plain word — they also feed places with no formatting (tab titles, meta, alt
 * text, email subjects, spreadsheet cells) — and this puts it in italics where it is shown.
 * Matches the whole word only, so "mifik.cl" or an address stays as it is.
 */
const BRAND_WORD = /\bfik\b/g;

export function withBrand(text: string): ReactNode {
  if (!BRAND_WORD.test(text)) return text;
  BRAND_WORD.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(BRAND_WORD)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(<i key={at}>fik</i>);
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

/** The same as HTML, for a plain-text string (Astro `set:html`): escaped first, then the word
 * in italics. */
export function brandHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped.replace(BRAND_WORD, "<i>fik</i>");
}
