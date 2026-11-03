import { scrubBreadcrumb, scrubEvent } from "./errorScrub";

/** Browser errors go to Sentry — only when `VITE_SENTRY_DSN` is set (production builds); anywhere
 * else every call here does nothing. The SDK is its own chunk, loaded once the app has painted, so
 * it never slows the first load; errors thrown before it arrives are held and sent with it. */
const DSN = import.meta.env.VITE_SENTRY_DSN?.trim() || "";

type Sentry = typeof import("./sentryClient");

let sdk: Promise<Sentry> | null = null;
const early: unknown[] = [];

function onEarlyError(event: ErrorEvent) {
  early.push(event.error ?? event.message);
}

function onEarlyRejection(event: PromiseRejectionEvent) {
  early.push(event.reason);
}

function load(): Promise<Sentry> {
  sdk ??= import("./sentryClient").then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_RELEASE || undefined,
      // Errors only: no performance tracing, no session replay (it would record balances on screen),
      // and nothing about the person — no user, cookies, headers, bodies, query or local variables.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
      // No clicks (their target can be a row showing an amount) and no console lines.
      integrations: (defaults) => [
        ...defaults.filter((integration) => integration.name !== "Console"),
        Sentry.breadcrumbsIntegration({ dom: false }),
      ],
      ignoreErrors: ["ResizeObserver loop"],
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    // The SDK's own handlers take over from here.
    window.removeEventListener("error", onEarlyError);
    window.removeEventListener("unhandledrejection", onEarlyRejection);
    for (const error of early.splice(0)) Sentry.captureException(error);
    return Sentry;
  });
  return sdk;
}

/** Called once from `main.tsx`: listens right away, loads the SDK when the browser is idle. */
export function startErrorReporting(): void {
  if (!DSN) return;
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
  const later = () => void load();
  if ("requestIdleCallback" in window) window.requestIdleCallback(later, { timeout: 5000 });
  else setTimeout(later, 2000);
}

/** An error the app caught itself (the crash screen, React outside the router). */
export function reportError(error: unknown): void {
  if (!DSN) return;
  void load().then((Sentry) => Sentry.captureException(error));
}
