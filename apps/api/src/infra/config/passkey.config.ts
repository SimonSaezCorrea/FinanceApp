import { ConfigService } from "@nestjs/config";

/** Required at boot, same as the other signing secrets — `getOrThrow` fails fast. */
export function getPasskeyChallengeSecret(config: ConfigService): string {
  return config.getOrThrow<string>("PASSKEY_CHALLENGE_SECRET");
}

/**
 * The frontend origin this backend trusts — already exists as `CORS_ORIGIN` (used by `main.ts`
 * for the same "which origin is the real frontend" purpose). Reused as-is for WebAuthn's
 * `expectedOrigin` rather than inventing a second, potentially-drifting source of truth.
 */
export function getPasskeyExpectedOrigin(config: ConfigService): string {
  return config.get<string>("CORS_ORIGIN") ?? "http://localhost:5173";
}

/** WebAuthn's `rpId` is the bare hostname (no scheme/port) of the trusted origin. */
export function getPasskeyRpId(config: ConfigService): string {
  return new URL(getPasskeyExpectedOrigin(config)).hostname;
}
