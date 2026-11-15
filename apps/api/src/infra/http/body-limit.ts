import type { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";

/**
 * Largest JSON body the routes that carry big payloads accept. Express's default (100 KB) is too
 * small for the importers: a 2.000-row bank statement or a 5.000-row template (specs/027) is
 * several hundred KB, and a 5.000-movement custom-field selection (specs/036) or its undo list
 * close to a megabyte.
 */
export const JSON_BODY_LIMIT = "5mb";

/** Every other route: a movement, an account with its cards, a passkey response… are a few KB.
 * Kept small so nobody can make the API parse megabytes before any guard ran (security run-4). */
export const DEFAULT_JSON_BODY_LIMIT = "256kb";

/** Path prefixes (after the global `/api/v1`) that take the large limit. */
export const LARGE_BODY_PATHS = [
  "/api/v1/import",
  "/api/v1/custom-fields",
  "/api/v1/transactions/transfers/cover",
] as const;

export function useJsonBodyLimit(app: NestExpressApplication): void {
  // The first parser that reads a body marks it parsed; the next one skips it.
  for (const path of LARGE_BODY_PATHS) app.use(path, json({ limit: JSON_BODY_LIMIT }));
  app.use(json({ limit: DEFAULT_JSON_BODY_LIMIT }));
}
