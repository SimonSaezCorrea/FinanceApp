import { useTranslation } from "react-i18next";

import type { customFields } from "@finance/contracts";

import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import {
  FormChip,
  FormDateField,
  FormNumberField,
  FormSelectField,
  FormTextField,
} from "../../../shared/ui/form";

type Value = customFields.CustomFieldValue;

interface Props {
  /** The fields to show — already narrowed to the movement (`fieldsFor`). */
  fields: readonly customFields.CustomField[];
  values: Record<string, Value>;
  /** `null` = no value. */
  onChange: (fieldId: string, value: Value | null) => void;
  disabled?: boolean;
}

/**
 * One row per custom field of a movement (specs/036), in the same label/value row
 * shape as the rest of the movement form. "Sin valor" is always a choice of its own,
 * distinct from "No" (FR-010).
 */
export function CustomFieldInputs({ fields, values, onChange, disabled }: Readonly<Props>) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col">
      {fields.map((field) => {
        const value = values[field.id];
        const id = `custom-field-${field.id}`;
        switch (field.type) {
          case "BOOLEAN":
            return (
              <DetailRow key={field.id} label={field.name}>
                <FormChip
                  aria-label={field.name}
                  value={value === undefined ? "" : String(value)}
                  onChange={(v) => onChange(field.id, v === "" ? null : v === "true")}
                  options={[
                    { value: "true", label: t("customFields.values.yes") },
                    { value: "false", label: t("customFields.values.no") },
                    { value: "", label: t("customFields.values.empty") },
                  ]}
                />
              </DetailRow>
            );
          case "OPTION":
            return (
              <FormSelectField
                key={field.id}
                id={id}
                label={field.name}
                value={value === undefined ? "" : String(value)}
                onChange={(v) => onChange(field.id, v === "" ? null : v)}
                disabled={disabled}
                options={[
                  { value: "", label: t("customFields.values.empty") },
                  ...field.options.map((o) => ({ value: o.id, label: o.label })),
                ]}
              />
            );
          case "NUMBER":
            return (
              <FormNumberField
                key={field.id}
                id={id}
                label={field.name}
                decimals={8}
                value={value === undefined ? "" : String(value)}
                onChange={(v) => onChange(field.id, v.trim() === "" ? null : v.replace(",", "."))}
                placeholder={t("customFields.values.empty")}
                disabled={disabled}
              />
            );
          case "DATE":
            return (
              <FormDateField
                key={field.id}
                id={id}
                label={field.name}
                clearable
                value={value === undefined ? "" : String(value)}
                onChange={(v) => onChange(field.id, v === "" ? null : v)}
                disabled={disabled}
              />
            );
          default:
            return (
              <FormTextField
                key={field.id}
                id={id}
                label={field.name}
                value={value === undefined ? "" : String(value)}
                onChange={(v) => onChange(field.id, v.trim() === "" ? null : v)}
                placeholder={t("customFields.values.empty")}
                disabled={disabled}
              />
            );
        }
      })}
    </div>
  );
}
