import { APP_URL } from "./config";

/** How long to wait for the app before treating it as down. */
export const APP_PROBE_TIMEOUT_MS = 4000;

/**
 * Whether the signed-in app answers, asked BEFORE sending someone there: navigating to an app
 * that is down shows the browser's own "this site can't be reached" page, with no way back to
 * what happened. A `no-cors` request needs nothing from the app (no CORS headers): it resolves
 * with an opaque response when the app answers at all and rejects when the connection is refused
 * or nothing answers — exactly the distinction needed. `robots.txt` is a tiny static file the app
 * always serves.
 */
export async function isAppReachable(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = APP_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await fetchImpl(`${APP_URL}/robots.txt`, {
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}
