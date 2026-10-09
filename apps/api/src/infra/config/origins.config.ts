import { ConfigService } from "@nestjs/config";

/** The local app, used when CORS_ORIGIN is not set (development). */
const DEFAULT_ORIGIN = "http://localhost:5173";

/** `scheme://host[:port]` — an origin, never a URL with a path or a trailing slash. */
const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/;

/**
 * Every origin allowed to call the API with credentials (specs/031): the public site and the app.
 * `CORS_ORIGIN` is a comma-separated list; a single origin (the format before specs/031) is a
 * one-item list. A malformed entry fails here, at boot, instead of silently opening or closing CORS.
 */
export function getAllowedOrigins(config: ConfigService): string[] {
  const raw = config.get<string>("CORS_ORIGIN") ?? DEFAULT_ORIGIN;
  const origins = raw.split(",").map((o) => o.trim());
  for (const origin of origins) {
    if (!ORIGIN_PATTERN.test(origin)) {
      throw new Error(
        `CORS_ORIGIN has an invalid origin "${origin}": expected scheme://host[:port], comma-separated`,
      );
    }
  }
  return origins;
}

/**
 * WebAuthn's relying-party id: `PASSKEY_RP_ID` when set (production: the parent domain, so one
 * passkey works on the public site AND in the app), otherwise the first origin's hostname.
 */
export function getPasskeyRpId(config: ConfigService): string {
  const explicit = config.get<string>("PASSKEY_RP_ID")?.trim();
  if (explicit) return explicit;
  return new URL(getAllowedOrigins(config)[0]!).hostname;
}

/**
 * Every allowed origin must be the rpId or one of its subdomains — otherwise a passkey could never
 * be used from that origin, and the API refuses to start rather than fail at sign-in time.
 */
export function assertOriginsMatchRpId(config: ConfigService): void {
  const rpId = getPasskeyRpId(config);
  for (const origin of getAllowedOrigins(config)) {
    const host = new URL(origin).hostname;
    if (host !== rpId && !host.endsWith(`.${rpId}`)) {
      throw new Error(
        `CORS_ORIGIN "${origin}" is not "${rpId}" nor a subdomain of it (PASSKEY_RP_ID): passkeys would not work there`,
      );
    }
  }
}
