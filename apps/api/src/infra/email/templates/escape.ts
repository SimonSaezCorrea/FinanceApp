const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Every value that goes into an email's HTML passes through here (a name, an address, a
 * passkey label are user input). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/** Text shown in an email's HTML body: escaped, and the product name written as a word (not the
 * logo) in italics, as everywhere else ("fik"). Whole word only: "mifik.cl" stays as it is.
 * Subjects, the preheader and the plain-text version have no formatting and keep the plain word. */
export function bodyHtml(value: string): string {
  return escapeHtml(value).replace(/\bfik\b/g, "<i>fik</i>");
}

/** Fills `{name}` placeholders. `escape` is on for HTML, off for the plain-text version. */
export function fill(template: string, values: Record<string, string>, escape: boolean): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return escape ? escapeHtml(value) : value;
  });
}
