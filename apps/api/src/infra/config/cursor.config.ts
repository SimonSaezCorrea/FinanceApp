import { ConfigService } from "@nestjs/config";

/**
 * Required at boot, same as `JWT_ACCESS_SECRET` — `getOrThrow` fails fast
 * rather than letting the API silently serve unsigned cursors.
 */
export function getCursorSigningSecret(config: ConfigService): string {
  return config.getOrThrow<string>("CURSOR_SIGNING_SECRET");
}
