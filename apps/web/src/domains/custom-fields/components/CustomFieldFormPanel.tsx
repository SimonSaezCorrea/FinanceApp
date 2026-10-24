import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts, customFields } from "@finance/contracts";

import { Button } from "@finance/ui/src/shared/ui/button";
import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { tempRowId } from "../../import/lib/tempRowId";
import {
  FormNotice,
  FormSelectField,
  FormSwitchField,
  FormTextField,
} from "../../../shared/ui/form";
import { customFieldsApi } from "../api/customFieldsApi";
import { CustomFieldInputs } from "./CustomFieldInputs";

type Value = customFields.CustomFieldValue;

export interface CustomFieldFormValue {
  name: string;
  type: customFields.CustomFieldType;
  options: customFields.CustomFieldOption[];
  scope: customFields.CustomFieldScope;
  defaultValue: Value | null;
  showAsColumn: boolean;
  applyDefaultToExisting: boolean;
}

export const emptyCustomFieldForm = (): CustomFieldFormValue => ({
  name: "",
  type: "BOOLEAN",
  options: [],
  scope: { movementKinds: [], accountIds: [], cardKinds: [] },
  defaultValue: null,
  showAsColumn: false,
  applyDefaultToExisting: false,
});

export function formFromField(field: customFields.CustomField): CustomFieldFormValue {
  return {
    name: field.name,
    type: field.type,
    options: field.options,
    scope: field.scope,
    defaultValue: field.defaultValue,
    showAsColumn: field.showAsColumn,
    applyDefaultToExisting: false,
  };
}

const TYPES: customFields.CustomFieldType[] = ["BOOLEAN", "TEXT", "NUMBER", "DATE", "OPTION"];
const KINDS: customFields.CustomFieldMovementKind[] = ["EXPENSE", "INCOME", "TRANSFER"];
const CARD_KINDS: customFields.CustomFieldCardKind[] = ["CREDIT", "DEBIT", "PREPAID"];

/** Toggle pills for a multi-choice scope dimension: nothing on = no restriction. */
function TogglePills<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderLabel,
}: Readonly<{
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  renderLabel: (value: T) => string;
}>) {
  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? selected.filter((s) => s !== option) : [...selected, option])
              }
              className={cn(
                "min-h-9 rounded-full border px-3 text-sm transition-colors",
                on
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {renderLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field being edited; absent = creating one. */
  field?: customFields.CustomField;
  value: CustomFieldFormValue;
  onChange: (patch: Partial<CustomFieldFormValue>) => void;
  accounts: readonly accounts.BankAccount[];
  onSubmit: () => void;
  submitting?: boolean;
  dirty?: boolean;
}

/**
 * Create/edit a custom field (specs/036): name, type, list options, scope (movement
 * kind, accounts, card used — nothing ticked = everything), default value and
 * "mostrar como columna". The type locks once a movement holds a value (FR-004);
 * creating one offers to give the default to the movements already in scope (FR-005).
 */
export function CustomFieldFormPanel({
  open,
  onOpenChange,
  field,
  value,
  onChange,
  accounts,
  onSubmit,
  submitting = false,
  dirty = false,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const creating = !field;
  const typeLocked = (field?.valueCount ?? 0) > 0;

  const existing = useQuery({
    queryKey: ["custom-fields", "scope-count", value.scope],
    queryFn: () => customFieldsApi.scopeCount(value.scope),
    enabled: open && creating && value.defaultValue !== null,
  });
  const existingCount = existing.data?.count ?? 0;

  const options = value.options;
  const setOption = (index: number, label: string) =>
    onChange({ options: options.map((o, i) => (i === index ? { ...o, label } : o)) });
  const removeOption = (index: number) => {
    const removed = options[index];
    onChange({
      options: options.filter((_, i) => i !== index),
      ...(removed && value.defaultValue === removed.id ? { defaultValue: null } : {}),
    });
  };

  const optionsOk =
    value.type !== "OPTION" ||
    (options.length > 0 && options.every((o) => o.label.trim().length > 0));
  const canSubmit = value.name.trim().length > 0 && optionsOk;

  // The default is edited with the very input a movement uses.
  const defaultField: customFields.CustomField = {
    id: "default",
    name: t("customFields.form.default"),
    type: value.type,
    options: options.filter((o) => o.label.trim().length > 0),
    scope: value.scope,
    scopeBroken: false,
    defaultValue: null,
    showAsColumn: false,
    sortOrder: 0,
    valueCount: 0,
  };

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={creating ? "create" : "edit"}
      surface="panel"
      eyebrow={creating ? t("customFields.new") : t("customFields.edit")}
      title={creating ? t("customFields.new") : value.name}
      hideCancel
      canSubmit={canSubmit}
      submitting={submitting}
      dirty={dirty}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col">
          <FormTextField
            id="custom-field-name"
            label={t("customFields.form.name")}
            value={value.name}
            onChange={(name) => onChange({ name })}
            placeholder={t("customFields.form.namePlaceholder")}
            autoFocus={creating}
          />
          <FormSelectField
            id="custom-field-type"
            label={t("customFields.form.type")}
            value={value.type}
            disabled={typeLocked}
            onChange={(type) =>
              onChange({
                type: type as customFields.CustomFieldType,
                defaultValue: null,
                options:
                  type === "OPTION" && options.length === 0
                    ? [{ id: tempRowId(), label: "" }]
                    : options,
              })
            }
            options={TYPES.map((type) => ({ value: type, label: t(`customFields.type.${type}`) }))}
          />
        </div>
        {typeLocked ? (
          <FormNotice>
            {t("customFields.form.typeLocked", { count: field?.valueCount ?? 0 })}
          </FormNotice>
        ) : null}

        {value.type === "OPTION" ? (
          <section className="flex flex-col gap-2" aria-label={t("customFields.form.options")}>
            <h3 className="text-sm font-medium">{t("customFields.form.options")}</h3>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  value={option.label}
                  onChange={(e) => setOption(index, e.target.value)}
                  placeholder={t("customFields.form.optionPlaceholder")}
                  aria-label={t("customFields.form.optionPlaceholder")}
                  maxLength={40}
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 shrink-0 px-0"
                  onClick={() => removeOption(index)}
                  aria-label={t("customFields.form.removeOption")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={options.length >= 50}
              onClick={() => onChange({ options: [...options, { id: tempRowId(), label: "" }] })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {t("customFields.form.addOption")}
            </Button>
          </section>
        ) : null}

        <section className="flex flex-col" aria-label={t("customFields.form.scope")}>
          <h3 className="text-sm font-medium">{t("customFields.form.scope")}</h3>
          <p className="text-xs text-muted-foreground">{t("customFields.form.scopeHint")}</p>
          <TogglePills
            label={t("customFields.form.movementKinds")}
            options={KINDS}
            selected={value.scope.movementKinds}
            onChange={(movementKinds) => onChange({ scope: { ...value.scope, movementKinds } })}
            renderLabel={(k) => t(`customFields.kind.${k}`)}
          />
          <TogglePills
            label={t("customFields.form.cardKinds")}
            options={CARD_KINDS}
            selected={value.scope.cardKinds}
            onChange={(cardKinds) => onChange({ scope: { ...value.scope, cardKinds } })}
            renderLabel={(k) => t(`customFields.cardKind.${k}`)}
          />
          <TogglePills
            label={t("customFields.form.accounts")}
            options={accounts.map((a) => a.id)}
            selected={value.scope.accountIds}
            onChange={(accountIds) => onChange({ scope: { ...value.scope, accountIds } })}
            renderLabel={(id) => accounts.find((a) => a.id === id)?.name ?? id}
          />
        </section>

        <CustomFieldInputs
          fields={[defaultField]}
          values={value.defaultValue === null ? {} : { default: value.defaultValue }}
          onChange={(_, defaultValue) => onChange({ defaultValue })}
        />

        <div className="flex flex-col">
          <FormSwitchField
            label={t("customFields.form.showAsColumn")}
            checked={value.showAsColumn}
            onChange={(showAsColumn) => onChange({ showAsColumn })}
          />
          {creating && value.defaultValue !== null ? (
            existingCount > 0 ? (
              <FormSwitchField
                label={t("customFields.form.applyExisting", { count: existingCount })}
                checked={value.applyDefaultToExisting}
                onChange={(applyDefaultToExisting) => onChange({ applyDefaultToExisting })}
              />
            ) : existing.isSuccess ? (
              <DetailRow label={t("customFields.form.applyExistingNone")} />
            ) : null
          ) : null}
        </div>
      </div>
    </FormSurface>
  );
}
