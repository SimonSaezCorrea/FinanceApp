import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted at every depth, arrays left in order.
 * `JSON.stringify` preserves insertion order, which is not guaranteed to match
 * between two serializations of the same logical payload — so hashing its output
 * directly would report "different data" for a byte-identical retry.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

/**
 * Fingerprint of a request body, used ONLY to answer "is this retry carrying the
 * same data as the attempt that claimed this key?" (FR-005).
 *
 * It is NEVER used to decide whether two operations are the same — that is what
 * the client's key is for. Two identical coffees on the same day hash alike and
 * still both go through, because they carry different keys.
 */
export function requestHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(body) ?? null))
    .digest("hex");
}
