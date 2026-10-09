/**
 * What any HTTP client of the API needs at runtime and nothing more — no zod — as its own entry
 * point (`@finance/contracts/http`), so a page that only signs in (the public site's access panel,
 * spec 031) doesn't ship every contract.
 */
export const API_VERSION = "v1";
export const API_BASE_PATH = `/api/${API_VERSION}`;

/** Request header carrying an idempotency key. Lowercase — that is how Node normalizes it. */
export const IDEMPOTENCY_HEADER = "idempotency-key";
