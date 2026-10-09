import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { assertOriginsMatchRpId, getAllowedOrigins } from "../config/origins.config";

/**
 * CORS with credentials for exactly the configured origins (specs/031, FR-018): the public site and
 * the app. Any other origin gets no `Access-Control-Allow-Origin`, so the browser blocks the
 * response. Also checks at boot that the passkey rpId covers every origin. Called by `main.ts`; an
 * e2e that builds its own app calls it too.
 */
export function useCors(app: INestApplication): void {
  const config = app.get(ConfigService);
  assertOriginsMatchRpId(config);
  app.enableCors({ origin: getAllowedOrigins(config), credentials: true });
}
