import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";

/** Every crawler out: nothing on the API is a page. */
export const ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/**
 * Keeps search engines off the API. Search Console's domain property for `mifik.cl` covers
 * `api.mifik.cl`, and Google fetched endpoints it found in the sites' JavaScript (a 401 from
 * `/auth/me` showed up as "blocked due to another 4xx issue"). The API now answers `/robots.txt`
 * with `Disallow: /` (Cloudflare's managed robots.txt adds its content signals on top of the origin's)
 * and marks every response — errors included — `X-Robots-Tag: noindex, nofollow`, for a URL a crawler
 * reaches anyway. Express-level, so the `api/v1` prefix doesn't apply. Called by `main.ts`.
 */
export function useNoIndex(app: NestExpressApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if ((req.method === "GET" || req.method === "HEAD") && req.path === "/robots.txt") {
      res.type("text/plain").send(ROBOTS_TXT);
      return;
    }
    next();
  });
}
