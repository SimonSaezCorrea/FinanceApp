import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";

/**
 * Gzip/deflate for every response above `compression`'s 1 KB threshold. The movement lists the
 * Panel reads are JSON that shrinks several times over (Lighthouse estimated 91 KiB saved on that
 * screen alone), and the API is called directly from the browser, so nothing in front compresses
 * it in development. A reverse proxy that already compresses in production makes this a no-op
 * (`Content-Encoding` is set once).
 */
export function useCompression(app: NestExpressApplication): void {
  app.use(compression());
}
