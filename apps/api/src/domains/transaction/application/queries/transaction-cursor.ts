import { createHmac, timingSafeEqual } from "node:crypto";

import { InvalidCursorError } from "../../domain/errors";
import type { TransactionCursor } from "../../domain/ports/transaction.repository.port";

const SEPARATOR = "|";
const PART_SEPARATOR = ".";

/** Bumping this invalidates every cursor issued under a prior version — the
 * version travels INSIDE the signed payload so a downgrade attempt is itself
 * caught by the MAC check, not by a separate unsigned check. */
const CURSOR_VERSION = "1";

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

/**
 * The keyset cursor crossing the HTTP boundary: `base64url(payload) +
 * "." + base64url(HMAC-SHA256(secret, payload))`. "Opaque" here means
 * authenticated by this server, not merely base64-encoded — a client must
 * treat it as a value to hand back untouched, never one it can forge or
 * compute (see the port for why the key is `(occurredAt, id)`).
 */
export function encodeCursor(cursor: TransactionCursor, secret: string): string {
  const payload = `${CURSOR_VERSION}${SEPARATOR}${cursor.occurredAt.toISOString()}${SEPARATOR}${cursor.id}`;
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const macB64 = sign(payload, secret).toString("base64url");
  return `${payloadB64}${PART_SEPARATOR}${macB64}`;
}

export function decodeCursor(raw: string, secret: string): TransactionCursor {
  const parts = raw.split(PART_SEPARATOR);
  if (parts.length !== 2) throw new InvalidCursorError();
  const [payloadB64, macB64] = parts;

  let payload: string;
  let mac: Buffer;
  try {
    payload = Buffer.from(payloadB64!, "base64url").toString("utf8");
    mac = Buffer.from(macB64!, "base64url");
  } catch {
    throw new InvalidCursorError();
  }

  const expectedMac = sign(payload, secret);
  if (mac.length !== expectedMac.length || !timingSafeEqual(mac, expectedMac)) {
    throw new InvalidCursorError();
  }

  const [version, occurredAt, id] = payload.split(SEPARATOR);
  if (version !== CURSOR_VERSION) throw new InvalidCursorError();

  const parsed = occurredAt ? new Date(occurredAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || !id) throw new InvalidCursorError();
  return { occurredAt: parsed, id };
}
