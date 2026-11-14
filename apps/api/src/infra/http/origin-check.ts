import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";

/** Methods that only read: never refused for their origin. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a request may proceed (security run-3 hardening): a write that a BROWSER sends carries
 * an `Origin` header, and it must be one of the allowed origins (`CORS_ORIGIN`). `SameSite=Lax`
 * cookies already stop another SITE from writing with the person's session, but every subdomain of
 * mifik.cl is the same site — a page on any of them could. A request without `Origin` (curl, a
 * server, the test suites) isn't a browser acting for someone, and passes.
 */
export function isOriginAllowed(
  method: string,
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  if (origin === undefined) return true;
  return allowed.includes(origin);
}

/** Express-level, before any route. Called by `main.ts` with the CORS origins. */
export function useOriginCheck(app: NestExpressApplication, allowed: readonly string[]): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isOriginAllowed(req.method, req.headers.origin, allowed)) {
      next();
      return;
    }
    res.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED" } });
  });
}
