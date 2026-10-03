import { createHmac } from "node:crypto";

import { ConfigService } from "@nestjs/config";

/** Shared HMAC key for every place this app hashes an identifier (RUT/DNI/etc.) instead of
 * storing it in the clear — today: the account-deletion compliance log and a minor's guardian
 * authorization record. `getOrThrow` fails fast (on first use) rather than letting either
 * feature silently hash with no key. Same required-secret pattern as `CURSOR_SIGNING_SECRET`. */
export function getIdentifierHashSecret(config: ConfigService): string {
  return config.getOrThrow<string>("IDENTIFIER_HASH_SECRET");
}

/** HMAC-SHA256 of an identifier (RUT/DNI/etc.), hex-encoded — never the raw value. Caveat,
 * documented rather than hidden: a RUT's keyspace is small (~8 digits + check digit), so this
 * resists casual DB inspection but is NOT cryptographically hard to reverse by brute force for
 * anyone who also has the HMAC secret — it is proof-of-occurrence, not a vault. */
export function hashIdentifier(identifierValue: string, secret: string): string {
  return createHmac("sha256", secret).update(identifierValue).digest("hex");
}
