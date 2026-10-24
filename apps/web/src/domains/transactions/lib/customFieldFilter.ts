import type { transactions } from "@finance/contracts";

/**
 * The Movimientos filter by one custom field (specs/036): the field and ONE
 * predicate on it. Lives in the URL (`cf`, `cfv`, …) so the "Columnas propias" summary can
 * link straight to it, and a filtered list can be shared or reloaded.
 */
export type CustomFieldFilter =
  | { fieldId: string; mode: "value"; value: string }
  | { fieldId: string; mode: "empty" }
  | { fieldId: string; mode: "hasValue" }
  | { fieldId: string; mode: "text"; text: string }
  | { fieldId: string; mode: "range"; min: string; max: string };

export function filterFromSearchParams(params: URLSearchParams): CustomFieldFilter | undefined {
  const fieldId = params.get("cf");
  if (!fieldId) return undefined;
  if (params.get("cfEmpty") === "true") return { fieldId, mode: "empty" };
  if (params.get("cfHasValue") === "true") return { fieldId, mode: "hasValue" };
  const value = params.get("cfv");
  if (value !== null) return { fieldId, mode: "value", value };
  const text = params.get("cfText");
  if (text !== null) return { fieldId, mode: "text", text };
  if (params.has("cfMin") || params.has("cfMax")) {
    return {
      fieldId,
      mode: "range",
      min: params.get("cfMin") ?? "",
      max: params.get("cfMax") ?? "",
    };
  }
  return { fieldId, mode: "hasValue" };
}

const KEYS = ["cf", "cfv", "cfEmpty", "cfHasValue", "cfText", "cfMin", "cfMax"] as const;

/** The same params, written onto `params` (others untouched). */
export function writeSearchParams(params: URLSearchParams, filter: CustomFieldFilter | undefined) {
  for (const key of KEYS) params.delete(key);
  if (!filter) return;
  for (const [key, value] of Object.entries(toApiFilter(filter))) {
    if (value !== undefined) params.set(key, value);
  }
}

/** The API's `cf…` query filters. A predicate not complete yet (an empty text, a
 * range with no bound) filters by "has a value" until it is. */
export function toApiFilter(
  filter: CustomFieldFilter | undefined,
): Pick<
  transactions.TransactionFilters,
  "cf" | "cfv" | "cfEmpty" | "cfHasValue" | "cfText" | "cfMin" | "cfMax"
> {
  if (!filter) return {};
  const cf = filter.fieldId;
  switch (filter.mode) {
    case "value":
      return { cf, cfv: filter.value };
    case "empty":
      return { cf, cfEmpty: "true" };
    case "text":
      return filter.text.trim() ? { cf, cfText: filter.text.trim() } : { cf, cfHasValue: "true" };
    case "range":
      return filter.min || filter.max
        ? { cf, cfMin: filter.min || undefined, cfMax: filter.max || undefined }
        : { cf, cfHasValue: "true" };
    default:
      return { cf, cfHasValue: "true" };
  }
}
