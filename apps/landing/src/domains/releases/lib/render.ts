import { brandHtml } from "@finance/ui/src/shared/lib/brand";
import type { InlineToken } from "@finance/release-notes";

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One change of a release record (spec 038) as HTML for `set:html`: every piece escaped, "fik"
 * in italics in the text, links only ever https (the parser refuses anything else). */
export function changeHtml(tokens: readonly InlineToken[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "text":
          return brandHtml(token.text);
        case "strong":
          return `<strong>${brandHtml(token.text)}</strong>`;
        case "code":
          return `<code>${escape(token.text)}</code>`;
        case "link":
          return `<a href="${escape(token.href)}">${brandHtml(token.text)}</a>`;
      }
    })
    .join("");
}
