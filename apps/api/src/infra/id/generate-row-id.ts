import { v7 as uuidv7 } from "uuid";

/**
 * The one place application code mints a row identifier explicitly — for the
 * handful of write paths that need the value before the row is inserted (a
 * cross-referenced field in the same transaction, or a non-PK correlation
 * value like `transferGroupId`) and so can't rely on Prisma's own
 * `@default(uuid(7))` schema default. Every table's schema default and every
 * call to this function produce the same UUID v7 format.
 */
export function generateRowId(): string {
  return uuidv7();
}
