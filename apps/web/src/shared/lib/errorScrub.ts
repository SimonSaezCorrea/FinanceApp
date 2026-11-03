import type { Breadcrumb, ErrorEvent } from "@sentry/react";

/** What leaves the browser in an error report must never identify the person or show their money:
 * an address loses its query and hash (filters, ids, one-time tokens) and keeps only its path. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function stripIfString(value: unknown): unknown {
  return typeof value === "string" ? stripQuery(value) : value;
}

/** `beforeSend`: the page address without its query, and no request headers (the referrer is an
 * address too, and cookies never go — `sendDefaultPii` is off, this is the second lock). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.query_string;
    delete event.request.data;
  }
  delete event.user;
  return event;
}

/** `beforeBreadcrumb`: navigations and API calls keep their path, never their query. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) if (key in data) data[key] = stripIfString(data[key]);
  }
  return breadcrumb;
}
