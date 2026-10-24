import type { TFunction } from "i18next";

import { customFields as rules, type customFields, type imports } from "@finance/contracts";

import { normalize, parseAmount, parseDate, type Cell } from "./importParsing";
import { valueKey } from "./templateSpec";

/**
 * The person's custom fields as extra columns of the template (specs/036): one per
 * field at the end of Movimientos — and of Traspasos for a field that applies to
 * transfers — headed by the field's own name. Its cells are keyed `cf:<fieldId>` so
 * they can't clash with the template's own column keys.
 */
export const CUSTOM_COLUMN_PREFIX = "cf:";
export const customColumnKey = (fieldId: string) => `${CUSTOM_COLUMN_PREFIX}${fieldId}`;
export const isCustomColumn = (key: string) => key.startsWith(CUSTOM_COLUMN_PREFIX);
export const fieldIdOf = (key: string) => key.slice(CUSTOM_COLUMN_PREFIX.length);

type Field = customFields.CustomField;
type Value = customFields.CustomFieldValue;

/** The sheets that carry custom columns, and which fields go on each. */
export function fieldsForSheet(fields: readonly Field[], sheet: imports.TemplateSheetKey): Field[] {
  const kinds = (f: Field) => f.scope.movementKinds;
  if (sheet === "movements") {
    return fields.filter(
      (f) => kinds(f).length === 0 || kinds(f).some((k) => k === "EXPENSE" || k === "INCOME"),
    );
  }
  if (sheet === "transfers") {
    return fields.filter((f) => kinds(f).length === 0 || kinds(f).includes("TRANSFER"));
  }
  return [];
}

/** A header matches a field when its normalized text equals the field's name. */
export function fieldForHeader(fields: readonly Field[], header: Cell): Field | undefined {
  const text = rules.normalizeFieldName(String(header ?? ""));
  return text ? fields.find((f) => rules.normalizeFieldName(f.name) === text) : undefined;
}

/** The note on a custom column's header: its type and, for lists, its options. */
export function customColumnNote(field: Field, t: TFunction): string {
  const type = t(`customFields.type.${field.type}`);
  const options =
    field.type === "OPTION"
      ? field.options.map((o) => o.label).join(", ")
      : field.type === "BOOLEAN"
        ? `${t(valueKey("yesNo", "YES"))}, ${t(valueKey("yesNo", "NO"))}`
        : "";
  return t("import.template.customFieldHelp", { type, options });
}

/** A stored value as a cell of the pre-filled template. */
export function customCell(field: Field, value: Value | undefined, t: TFunction): Cell {
  if (value === undefined) return null;
  switch (field.type) {
    case "BOOLEAN":
      return t(valueKey("yesNo", value ? "YES" : "NO"));
    case "OPTION":
      return field.options.find((o) => o.id === value)?.label ?? null;
    case "NUMBER":
      return Number(value);
    case "DATE": {
      const [y, m, d] = String(value).split("-").map(Number);
      return new Date(Date.UTC(y!, m! - 1, d!));
    }
    default:
      return String(value);
  }
}

export type ParsedCell = { ok: true; value: Value } | { ok: false };

/** A cell read back as a value of the field: yes/no and options by their label in
 * every language, numbers and dates the way the rest of the template reads them. */
export function parseCustomCell(field: Field, cell: Cell, labelers: TFunction[]): ParsedCell {
  if (cell === null || String(cell).trim() === "") return { ok: false };
  let raw: unknown = cell;
  switch (field.type) {
    case "BOOLEAN": {
      if (typeof cell === "boolean") {
        raw = cell;
        break;
      }
      const text = normalize(cell);
      const yes = new Set([
        "true",
        "si",
        "yes",
        ...labelers.map((t) => normalize(t(valueKey("yesNo", "YES")))),
      ]);
      const no = new Set([
        "false",
        "no",
        ...labelers.map((t) => normalize(t(valueKey("yesNo", "NO")))),
      ]);
      raw = yes.has(text) ? true : no.has(text) ? false : null;
      break;
    }
    case "OPTION":
      raw = field.options.find((o) => normalize(o.label) === normalize(cell))?.id ?? null;
      break;
    case "NUMBER":
      raw = parseAmount(cell);
      break;
    case "DATE":
      raw = parseDate(cell);
      break;
    default:
      raw = String(cell).trim();
  }
  const parsed = rules.parseFieldValue(field, raw);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
}
