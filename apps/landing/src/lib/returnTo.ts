import { safeReturnPath } from "@finance/client";

import { APP_URL } from "./config";

/** Where a successful sign-in sends someone: the app, at the path they were trying to reach when
 * it is safe (`safeReturnPath`), otherwise at the Panel. Only a PATH ever travels in the URL —
 * never a token: the session is the API's own cookies (spec 031, FR-012). */
export function appUrl(returnTo: string | null | undefined): string {
  return `${APP_URL}${safeReturnPath(returnTo)}`;
}
