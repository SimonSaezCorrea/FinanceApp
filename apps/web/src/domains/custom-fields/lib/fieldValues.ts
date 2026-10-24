import { customFields, type accounts, type transactions } from "@finance/contracts";

type Field = customFields.CustomField;
type Value = customFields.CustomFieldValue;

/** The contract's scope plus the flag the shared rule reads (naming accounts is
 * what restricts it — a broken scope names none and applies to nothing). */
export function scopeRule(field: Field): customFields.CustomFieldScopeRule {
  return {
    movementKinds: field.scope.movementKinds,
    restrictAccounts: field.scope.accountIds.length > 0 || field.scopeBroken,
    accountIds: field.scope.accountIds,
    cardKinds: field.scope.cardKinds,
  };
}

/** What a scope looks at in a movement — or in a movement being written. */
export function shapeOf(
  movement: {
    type: transactions.TransactionType;
    transferGroupId?: string | null;
    bankAccountId: string | null;
    cardId?: string | null;
  },
  accountList: readonly accounts.BankAccount[],
): customFields.MovementShape {
  const card = movement.cardId
    ? accountList.flatMap((a) => a.cards).find((c) => c.id === movement.cardId)
    : undefined;
  return {
    kind: movement.transferGroupId ? "TRANSFER" : movement.type,
    bankAccountId: movement.bankAccountId,
    cardKind: card?.kind ?? null,
  };
}

/** The fields a movement shows: those that apply, plus those it already holds a
 * value for (it left the scope later, so the value can still be seen and cleared). */
export function fieldsFor(
  fields: readonly Field[],
  shape: customFields.MovementShape,
  values: Record<string, Value> | undefined,
): Field[] {
  return fields.filter((f) =>
    customFields.fieldShowsFor(scopeRule(f), shape, f.id in (values ?? {})),
  );
}

/** The values a movement being created starts with: each applying field's default. */
export function defaultsFor(
  fields: readonly Field[],
  shape: customFields.MovementShape,
): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const f of fields) {
    if (f.defaultValue !== null && customFields.fieldAppliesTo(scopeRule(f), shape)) {
      out[f.id] = f.defaultValue;
    }
  }
  return out;
}

/** A value as the API accepts it: a number being typed may end in its decimal point
 * ("12."), which is the same number. */
export function sendable(field: Field, value: Value | null): Value | null {
  if (value === null || field.type !== "NUMBER") return value;
  const text = String(value).replace(/\.$/, "");
  return text === "" || text === "-" ? null : text;
}

/**
 * What to send when creating a movement: every field that applies, with what the
 * form holds — `null` for one the person emptied, so a default is never written
 * against their choice. A field that doesn't apply is left out (it would be refused).
 */
export function creationPayload(
  fields: readonly Field[],
  shape: customFields.MovementShape,
  values: Record<string, Value>,
): Record<string, Value | null> {
  const out: Record<string, Value | null> = {};
  for (const f of fields) {
    if (customFields.fieldAppliesTo(scopeRule(f), shape))
      out[f.id] = sendable(f, values[f.id] ?? null);
  }
  return out;
}

/** A value as text, in the person's language. */
export function displayValue(
  field: Field,
  value: Value | undefined,
  t: (key: string) => string,
  locale: string,
): string {
  if (value === undefined) return "";
  switch (field.type) {
    case "BOOLEAN":
      return value ? t("customFields.values.yes") : t("customFields.values.no");
    case "OPTION":
      return field.options.find((o) => o.id === value)?.label ?? "";
    case "NUMBER":
      return Number(value).toLocaleString(locale, { maximumFractionDigits: 8 });
    case "DATE": {
      const [y, m, d] = String(value).split("-").map(Number);
      return new Date(y!, m! - 1, d!).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    default:
      return String(value);
  }
}

/** The `cfv` of a value in the URL: booleans as `true`/`false`, the rest as is. */
export const toQueryValue = (value: Value): string => String(value);
