import { createHmac } from "node:crypto";

import { ConfigService } from "@nestjs/config";

/** `getOrThrow` fails fast (on the first account-deletion request) rather than letting the API
 * silently log deletion evidence with no key or, worse, fall back to hashing with an implicit
 * default. Same required-secret pattern as `CURSOR_SIGNING_SECRET`. */
export function getAccountDeletionHmacSecret(config: ConfigService): string {
  return config.getOrThrow<string>("ACCOUNT_DELETION_HMAC_SECRET");
}

/** HMAC-SHA256 of an identifier (RUT/DNI/etc.), hex-encoded — never the raw value. See
 * `AccountDeletionLog`'s doc-comment for what this proves and its honest limits (a RUT's small
 * keyspace means this resists casual inspection, not a targeted brute force by someone who
 * also holds the secret). */
export function hashIdentifier(identifierValue: string, secret: string): string {
  return createHmac("sha256", secret).update(identifierValue).digest("hex");
}
