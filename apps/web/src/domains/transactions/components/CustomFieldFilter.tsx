import { useTranslation } from "react-i18next";

import type { customFields } from "@finance/contracts";

import type { CustomFieldFilter as Filter } from "../lib/customFieldFilter";
import { PillSelect } from "./TransactionFiltersBar";

interface Props {
  fields: readonly customFields.CustomField[];
  value: Filter | undefined;
  onChange: (value: Filter | undefined) => void;
}

const inputClass =
  "h-9 w-32 rounded-md border bg-card px-3 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Filter Movimientos by one custom field (specs/036, FR-013): pick the field, then
 * its predicate — a value or "sin valor" for yes/no and lists; "con valor", "sin
 * valor", contains (text) or a range (number, date) for the rest.
 */
export function CustomFieldFilter({ fields, value, onChange }: Readonly<Props>) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;
  const field = fields.find((f) => f.id === value?.fieldId);

  const pickField = (fieldId: string) => {
    const next = fields.find((f) => f.id === fieldId);
    if (!next) return onChange(undefined);
    onChange(
      next.type === "BOOLEAN"
        ? { fieldId, mode: "value", value: "false" }
        : next.type === "OPTION"
          ? { fieldId, mode: "value", value: next.options[0]?.id ?? "" }
          : { fieldId, mode: "hasValue" },
    );
  };

  const choiceValue =
    value?.mode === "value" ? value.value : value?.mode === "empty" ? "__empty" : "";
  const pickChoice = (choice: string) =>
    field &&
    onChange(
      choice === "__empty"
        ? { fieldId: field.id, mode: "empty" }
        : { fieldId: field.id, mode: "value", value: choice },
    );

  const modeValue = value?.mode ?? "hasValue";
  const pickMode = (mode: string) => {
    if (!field) return;
    if (mode === "empty") onChange({ fieldId: field.id, mode: "empty" });
    else if (mode === "text") onChange({ fieldId: field.id, mode: "text", text: "" });
    else if (mode === "range") onChange({ fieldId: field.id, mode: "range", min: "", max: "" });
    else onChange({ fieldId: field.id, mode: "hasValue" });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PillSelect
        value={field?.id ?? ""}
        onChange={pickField}
        label={t("customFields.filter.label")}
      >
        <option value="">{t("customFields.filter.none")}</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </PillSelect>

      {field && (field.type === "BOOLEAN" || field.type === "OPTION") ? (
        <PillSelect
          value={choiceValue}
          onChange={pickChoice}
          label={`${field.name}: ${t("customFields.filter.value")}`}
        >
          {field.type === "BOOLEAN" ? (
            <>
              <option value="true">{t("customFields.values.yes")}</option>
              <option value="false">{t("customFields.values.no")}</option>
            </>
          ) : (
            field.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))
          )}
          <option value="__empty">{t("customFields.values.empty")}</option>
        </PillSelect>
      ) : null}

      {field && field.type !== "BOOLEAN" && field.type !== "OPTION" ? (
        <>
          <PillSelect
            value={modeValue}
            onChange={pickMode}
            label={`${field.name}: ${t("customFields.filter.value")}`}
          >
            <option value="hasValue">{t("customFields.values.hasValue")}</option>
            <option value="empty">{t("customFields.values.empty")}</option>
            {field.type === "TEXT" ? (
              <option value="text">{t("customFields.filter.text")}</option>
            ) : (
              <option value="range">
                {`${t("customFields.filter.min")} / ${t("customFields.filter.max")}`}
              </option>
            )}
          </PillSelect>
          {value?.mode === "text" ? (
            <input
              className={inputClass}
              value={value.text}
              onChange={(e) => onChange({ ...value, text: e.target.value })}
              aria-label={`${field.name}: ${t("customFields.filter.text")}`}
              placeholder={t("customFields.filter.text")}
            />
          ) : null}
          {value?.mode === "range" ? (
            <>
              <input
                className={inputClass}
                type={field.type === "DATE" ? "date" : "text"}
                inputMode={field.type === "DATE" ? undefined : "decimal"}
                value={value.min}
                onChange={(e) => onChange({ ...value, min: e.target.value.replace(",", ".") })}
                aria-label={`${field.name}: ${t("customFields.filter.min")}`}
                placeholder={t("customFields.filter.min")}
              />
              <input
                className={inputClass}
                type={field.type === "DATE" ? "date" : "text"}
                inputMode={field.type === "DATE" ? undefined : "decimal"}
                value={value.max}
                onChange={(e) => onChange({ ...value, max: e.target.value.replace(",", ".") })}
                aria-label={`${field.name}: ${t("customFields.filter.max")}`}
                placeholder={t("customFields.filter.max")}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
