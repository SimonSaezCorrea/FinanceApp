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

/** Fills `{name}` placeholders. `escape` is on for HTML, off for the plain-text version. */
export function fill(template: string, values: Record<string, string>, escape: boolean): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return escape ? escapeHtml(value) : value;
  });
}
