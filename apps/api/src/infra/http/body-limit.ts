import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * Largest JSON body the API accepts. Express's default (100 KB) is too small for
 * the importers: a 2.000-row bank statement or a 5.000-row Cuadra template
 * (specs/027) is several hundred KB — refused as `PayloadTooLargeError` (a 500)
 * before any validation ran. Everything else is far below this.
 */
export const JSON_BODY_LIMIT = "5mb";

export function useJsonBodyLimit(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
}
