/** Longest return path accepted; anything longer is not a real address in the app. */
export const RETURN_PATH_MAX_LENGTH = 2048;

/**
 * The ONE rule for where a sign-in may send someone back (spec 031, FR-013): a path inside the
 * app — it starts with a single `/`, carries no scheme or host and no backslash a browser could
 * read as one. Anything else (an outside URL, `//host`, a script) becomes `/`, the Panel. Shared
 * by the public site (where the return happens) and the app (which builds the link), so the two
 * can never disagree about what is safe.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > RETURN_PATH_MAX_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}
