/** Matches a canonical UUID v7 string (version nibble fixed at 7) — used across
 * e2e specs (specs/016) to assert an id was minted in the unified format, not
 * the old `randomUUID()` (v4) or `cuid()`. */
export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
