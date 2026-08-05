import { InvalidCursorError } from "../../domain/errors";
import type { TransactionCursor } from "../../domain/ports/transaction.repository.port";

const SEPARATOR = "|";

/**
 * The keyset cursor crossing the HTTP boundary, base64 so it reads as one
 * opaque token: clients must treat it as a value to hand back untouched, not a
 * position they can compute or increment (see the port for why the key is
 * `(occurredAt, id)`).
 */
export function encodeCursor(cursor: TransactionCursor): string {
  return Buffer.from(`${cursor.occurredAt.toISOString()}${SEPARATOR}${cursor.id}`).toString(
    "base64url",
  );
}

export function decodeCursor(raw: string): TransactionCursor {
  const [occurredAt, id] = Buffer.from(raw, "base64url").toString("utf8").split(SEPARATOR);
  const parsed = occurredAt ? new Date(occurredAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || !id) throw new InvalidCursorError();
  return { occurredAt: parsed, id };
}
