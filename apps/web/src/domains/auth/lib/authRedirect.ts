/**
 * Access lives in a side panel over the public landing, driven by the URL:
 * `/?acceso=login|registro` opens it on that tab, and `volver` carries the page a signed-out
 * visitor was trying to reach so signing in lands them back there instead of on the Panel.
 */
export type AuthPanelMode = "login" | "register";

export const AUTH_PARAM = "acceso";
export const RETURN_PARAM = "volver";

const SLUG: Record<AuthPanelMode, string> = { login: "login", register: "registro" };

export function authModeFromParam(value: string | null): AuthPanelMode | null {
  if (value === SLUG.login) return "login";
  if (value === SLUG.register) return "register";
  return null;
}

export function authModeParam(mode: AuthPanelMode): string {
  return SLUG[mode];
}

/** URL that opens the access panel, optionally remembering where to go afterwards. */
export function authPath(mode: AuthPanelMode, returnTo?: string | null): string {
  const params = new URLSearchParams({ [AUTH_PARAM]: SLUG[mode] });
  const safe = safeReturnTo(returnTo);
  if (safe !== "/") params.set(RETURN_PARAM, safe);
  return `/?${params.toString()}`;
}

/** Only same-app paths: `/accounts` yes; `//evil.com`, `https://…` or nothing → `/`. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
