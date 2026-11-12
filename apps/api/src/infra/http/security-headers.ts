import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";

/** The headers every API response carries, errors included (security run-3). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // A JSON answer is never read as script or HTML by a browser that guesses the type.
  "X-Content-Type-Options": "nosniff",
  // Nothing on the API is meant to be framed or to run anything.
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  // HTTPS only for a year, as the sites ask for their whole domain.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // No API response belongs in a shared cache or another site's Referer.
  "Referrer-Policy": "no-referrer",
};

/** Express-level (outside the `api/v1` prefix) so even a 404 carries them. Called by `main.ts`. */
export function useSecurityHeaders(app: NestExpressApplication): void {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    next();
  });
}
