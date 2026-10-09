import { ConfigService } from "@nestjs/config";

import { getAllowedOrigins } from "./origins.config";

export { getPasskeyRpId } from "./origins.config";

/** Required at boot, same as the other signing secrets — `getOrThrow` fails fast. */
export function getPasskeyChallengeSecret(config: ConfigService): string {
  return config.getOrThrow<string>("PASSKEY_CHALLENGE_SECRET");
}

/**
 * Every origin a WebAuthn ceremony may come from: the same list CORS trusts (`CORS_ORIGIN`) — the
 * public site, where people sign in with a passkey, and the app, where they register one and use it
 * to confirm their identity (specs/031). One source of truth, never a second drifting setting.
 */
export function getPasskeyExpectedOrigins(config: ConfigService): string[] {
  return getAllowedOrigins(config);
}
