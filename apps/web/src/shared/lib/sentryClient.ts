/** The only pieces of the Sentry SDK the app uses. `errorReporting` imports THIS module lazily:
 * importing `@sentry/react` itself would keep the whole SDK (replay, tracing…) in the chunk. */
export { breadcrumbsIntegration, captureException, init } from "@sentry/react";
