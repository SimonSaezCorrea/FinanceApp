/**
 * The rules of a custom field (specs/036) as pure functions, shared by the API's
 * `CustomField` aggregate and the web forms so both decide the same way: which
 * movements a field applies to, and whether a value fits it.
 */
import type { CustomFieldValue } from "../common/custom-field-value";

export type CustomFieldType = "BOOLEAN" | "TEXT" | "NUMBER" | "DATE" | "OPTION";
export type CustomFieldMovementKind = "EXPENSE" | "INCOME" | "TRANSFER";
export type CustomFieldCardKind = "CREDIT" | "DEBIT" | "PREPAID";

export interface CustomFieldOption {
  id: string;
  label: string;
}

/** What a field applies to. An empty list means "no restriction" in that dimension —
 * except `accountIds` with `restrictAccounts`, which then applies to nothing (every
 * account it named was deleted). */
export interface CustomFieldScopeRule {
  movementKinds: readonly CustomFieldMovementKind[];
  restrictAccounts: boolean;
  accountIds: readonly string[];
  cardKinds: readonly CustomFieldCardKind[];
}

/** The facts about a movement a scope looks at. */
export interface MovementShape {
  kind: CustomFieldMovementKind;
  bankAccountId: string | null;
  /** The kind of card it was made with, `null` without a card. */
  cardKind: CustomFieldCardKind | null;
}

export const CUSTOM_FIELD_NAME_MAX = 40;
export const CUSTOM_FIELD_TEXT_MAX = 200;
export const CUSTOM_FIELD_MAX_FIELDS = 20;
export const CUSTOM_FIELD_MAX_OPTIONS = 50;
/** How many movements one bulk assignment (or one "Transferir pendientes") may touch. */
export const CUSTOM_FIELD_ASSIGNMENT_MAX = 5000;
/** Above this many movements a bulk assignment asks for confirmation first (FR-016a). */
export const CUSTOM_FIELD_BULK_CONFIRM_THRESHOLD = 20;

/** Two names are the same field name when this is equal: lower-cased, without
 * accents, with spaces collapsed. */
export function normalizeFieldName(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** A transfer leg is TRANSFER for a scope, whatever its own type. */
export function movementKindOf(t: {
  type: "INCOME" | "EXPENSE";
  transferGroupId: string | null;
}): CustomFieldMovementKind {
  return t.transferGroupId ? "TRANSFER" : t.type;
}

export function fieldAppliesTo(scope: CustomFieldScopeRule, shape: MovementShape): boolean {
  if (scope.movementKinds.length > 0 && !scope.movementKinds.includes(shape.kind)) return false;
  if (scope.restrictAccounts) {
    if (!shape.bankAccountId || !scope.accountIds.includes(shape.bankAccountId)) return false;
  }
  if (scope.cardKinds.length > 0) {
    if (!shape.cardKind || !scope.cardKinds.includes(shape.cardKind)) return false;
  }
  return true;
}

/** A field shows on a movement when it applies to it, or when the movement already
 * holds a value for it (it moved out of scope later) — so the value can be seen and
 * cleared (FR-009). */
export function fieldShowsFor(
  scope: CustomFieldScopeRule,
  shape: MovementShape,
  hasValue: boolean,
): boolean {
  return hasValue || fieldAppliesTo(scope, shape);
}

const NUMBER_PATTERN = /^-?\d{1,16}(\.\d{1,8})?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export type ParsedFieldValue = { ok: true; value: CustomFieldValue } | { ok: false };

/** Whether `raw` is a valid value of a field of this type (and these options), and
 * its canonical form: a trimmed text, a number without a leading "+" or trailing
 * zeros after the point, an existing option id. */
export function parseFieldValue(
  field: { type: CustomFieldType; options: readonly CustomFieldOption[] },
  raw: unknown,
): ParsedFieldValue {
  switch (field.type) {
    case "BOOLEAN":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
    case "TEXT": {
      if (typeof raw !== "string") return { ok: false };
      const text = raw.trim();
      return text.length > 0 && text.length <= CUSTOM_FIELD_TEXT_MAX
        ? { ok: true, value: text }
        : { ok: false };
    }
    case "NUMBER": {
      if (typeof raw !== "string") return { ok: false };
      const text = raw.trim();
      if (!NUMBER_PATTERN.test(text)) return { ok: false };
      const canonical = text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
      return { ok: true, value: canonical === "-0" ? "0" : canonical };
    }
    case "DATE":
      return typeof raw === "string" && isRealDate(raw) ? { ok: true, value: raw } : { ok: false };
    case "OPTION":
      return typeof raw === "string" && field.options.some((o) => o.id === raw)
        ? { ok: true, value: raw }
        : { ok: false };
  }
}
