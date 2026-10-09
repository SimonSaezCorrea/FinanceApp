/**
 * The access panel lives in the URL of any public page (spec 031, contracts/routes.md):
 * `?acceso=login|registro` opens it on that view, and `volver` carries the path in the app a
 * signed-out visitor was trying to reach. Where a sign-in may send someone is decided by
 * `safeReturnPath` (`@finance/client`), the same rule the app uses to build the link.
 */
export type AuthPanelMode = "login" | "register";

export const AUTH_PARAM = "acceso";
export const RETURN_PARAM = "volver";

const SLUG: Record<AuthPanelMode, string> = { login: "login", register: "registro" };

export function authModeFromParam(value: string | null | undefined): AuthPanelMode | null {
  if (value === SLUG.login) return "login";
  if (value === SLUG.register) return "register";
  return null;
}

export function authModeParam(mode: AuthPanelMode): string {
  return SLUG[mode];
}
