import { safeReturnPath } from "@finance/client";

/**
 * The public site (spec 031) is a separate app: it hosts signing in and registering, so a
 * signed-out visit here leaves for it. Its access panel is opened by `?acceso=login|registro`, and
 * `volver` is the path in THIS app to come back to once signed in — the same `safeReturnPath` rule
 * the public site applies before using it, so the two can't disagree.
 */
export type AccessMode = "login" | "register";

const LANDING_URL = (import.meta.env.VITE_LANDING_URL ?? "http://localhost:4321")
  .trim()
  .replace(/\/+$/, "");

const MODE_PARAM: Record<AccessMode, string> = { login: "login", register: "registro" };

/** The public site's access panel, remembering where to come back to (omitted when it's `/`). */
export function landingAccessUrl(mode: AccessMode, returnTo?: string | null): string {
  const params = new URLSearchParams({ acceso: MODE_PARAM[mode] });
  const safe = safeReturnPath(returnTo);
  if (safe !== "/") params.set("volver", safe);
  return `${LANDING_URL}/?${params.toString()}`;
}

/** The public site's home (its root picks the visitor's language). */
export function landingHomeUrl(): string {
  return `${LANDING_URL}/`;
}
