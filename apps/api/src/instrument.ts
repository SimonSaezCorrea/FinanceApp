import * as Sentry from "@sentry/nestjs";

/**
 * Unexpected API errors go to Sentry — only when `SENTRY_DSN` is set (production, Parameter Store
 * `/fik/prod/SENTRY_DSN`); anywhere else nothing is sent. Imported FIRST by `main.ts`.
 *
 * Errors only, like the web app: no tracing and nothing about the person — no user, IP, cookies,
 * headers, bodies, query strings or local variables (a request carries balances and RUTs). Only
 * 5xx reach it (`AllExceptionsFilter`) plus failed scheduled jobs; a 4xx domain error is expected.
 */
const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // Unhandled errors from the HTTP layer are reported by AllExceptionsFilter (5xx only).
    integrations: (defaults) => defaults.filter((integration) => integration.name !== "Console"),
    // No outgoing-call breadcrumbs: those URLs carry a visitor's IP (IPinfo) or a provider's
    // credentials in the query (Banco Central).
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "http" ? null : breadcrumb),
    beforeSend(event) {
      if (event.request) {
        if (event.request.url) event.request.url = event.request.url.split(/[?#]/, 1)[0];
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
        delete event.request.data;
      }
      delete event.user;
      // Second lock behind AllExceptionsFilter's own description: an error reported from elsewhere
      // (a scheduled job, an unhandled rejection) keeps only the first line of its message, where
      // a library may print the data it was handed below it.
      for (const value of event.exception?.values ?? []) {
        if (value.value) value.value = value.value.split("\n", 1)[0]!.slice(0, 300);
      }
      return event;
    },
  });
}

export function reportError(error: unknown): void {
  if (dsn) Sentry.captureException(error);
}
