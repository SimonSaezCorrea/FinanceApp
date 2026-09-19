import { ConfigService } from "@nestjs/config";

/**
 * Required at boot, same as `JWT_ACCESS_SECRET` — `getOrThrow` fails fast rather than letting
 * the API silently store TOTP secrets in plaintext.
 */
export function getMfaEncryptionKey(config: ConfigService): string {
  return config.getOrThrow<string>("MFA_ENCRYPTION_KEY");
}

/**
 * Deliberately a DIFFERENT secret from `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` — a "second
 * factor pending" token must never be mistakable for a real session token, and signing them
 * with different secrets makes that structurally impossible rather than a matter of convention.
 */
export function getMfaPendingTokenSecret(config: ConfigService): string {
  return config.getOrThrow<string>("MFA_PENDING_TOKEN_SECRET");
}
