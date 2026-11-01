import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { movementTemplates as templatesContract } from "@finance/contracts";
import type { customFields, movementTemplates } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { Input } from "@finance/ui/src/shared/ui/input";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { CustomFieldInputs } from "../../custom-fields/components/CustomFieldInputs";
import { useCustomFields } from "../../custom-fields/hooks/useCustomFields";
import { fieldsFor, shapeOf } from "../../custom-fields/lib/fieldValues";
import { useRecurring } from "../../recurring/hooks/useRecurring";
import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import {
  TransactionFormPanel,
  type TransactionFormValue,
} from "../../transactions/components/TransactionFormPanel";
import { emptyTransactionForm } from "../../transactions/lib/emptyForm";
import { useMovementTemplateMutations } from "../hooks/useMovementTemplates";
import { applyTemplate } from "../lib/applyTemplate";
import { templateFromForm } from "../lib/templateFromForm";
import { TemplatePreview } from "./TemplatePreview";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Create or edit a movement template (specs/037) with the movement form itself — same
 * fields, same rules, minus the date (a template is used "today"), the projected balance
 * and transfers/prepagos. On top, the movement it records as it will look when used, then
 * the template's name (canvas "Nueva plantilla", design B).
 */
export function TemplateFormModal({
  open,
  onOpenChange,
  template,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The template being edited; absent = a new one. */
  template?: movementTemplates.MovementTemplate;
}>) {
  const { t } = useTranslation();
  const { data: accountList } = useAccounts();
  const { data: fieldList } = useCustomFields();
  const { data: series } = useRecurring();
  const { categories } = useCategoryCatalog();
  const { create, replace } = useMovementTemplateMutations();
  const editing = Boolean(template);
  const accounts = useMemo(() => accountList ?? [], [accountList]);
  const fields = useMemo(() => fieldList ?? [], [fieldList]);

  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionFormValue>(() => emptyTransactionForm(todayInput()));
  const [baseline, setBaseline] = useState("");

  // Offered accounts: active ones, plus the template's own even if inactive since.
  const selectable = useMemo(
    () => accounts.filter((a) => a.status === "ACTIVE" || a.id === template?.bankAccountId),
    [accounts, template?.bankAccountId],
  );

  // Prefill once per opening — for an edit, once the lists it is checked against have
  // arrived (a category or series not loaded yet would otherwise read as deleted).
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      prefilledFor.current = null;
      return;
    }
    const key = template?.id ?? "new";
    if (prefilledFor.current === key) return;
    if (template && (!accountList || !fieldList || !series || categories.length === 0)) return;
    prefilledFor.current = key;
    const start = template
      ? applyTemplate(template, {
          accounts,
          selectableIds: new Set(selectable.map((a) => a.id)),
          categories,
          recurringIds: new Set((series ?? []).map((s) => s.id)),
          fields,
          current: emptyTransactionForm(todayInput()),
          withDefaults: false,
        })
      : { ...emptyTransactionForm(todayInput()), customFields: {} };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open, not a derived value
    setForm(start);
    setName(template?.name ?? "");
    setNameError(null);
    setBaseline(JSON.stringify([template?.name ?? "", start]));
  }, [open, template, accountList, fieldList, series, categories, accounts, fields, selectable]);

  const values = form.customFields ?? {};
  const type = form.mode === "INCOME" ? "INCOME" : "EXPENSE";
  const shape = shapeOf(
    { type, bankAccountId: form.bankAccountId || null, cardId: form.cardId || null },
    accounts,
  );
  const shownFields = fieldsFor(fields, shape, undefined);
  const setFieldValue = (fieldId: string, value: customFields.CustomFieldValue | null) => {
    const next = { ...values };
    if (value === null) delete next[fieldId];
    else next[fieldId] = value;
    setForm((f) => ({ ...f, customFields: next }));
  };

  const pending = create.isPending || replace.isPending;
  const dirty = editing && JSON.stringify([name, form]) !== baseline;

  function submit() {
    const body = templateFromForm(form, {
      name,
      keepAmount: true,
      accounts,
      fields,
      fieldValues: values,
    });
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? t("templates.toast.updated") : t("templates.toast.created"));
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        if (code === "MOVEMENT_TEMPLATE_NAME_TAKEN") setNameError(t(`errors.${code}`));
        else toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    };
    if (template) replace.mutate({ id: template.id, body }, handlers);
    else create.mutate(body, handlers);
  }

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={editing ? "edit" : "create"}
      surface="panel"
      eyebrow={editing ? t("templates.form.editEyebrow") : t("templates.form.newEyebrow")}
      title={<span className="sr-only">{editing ? t("templates.edit") : t("templates.new")}</span>}
      description={t("templates.form.subtitle")}
      hideCancel
      submitLabel={editing ? undefined : t("templates.form.submit")}
      onSubmit={submit}
      canSubmit={name.trim().length > 0 && !pending}
      submitting={pending}
      dirty={dirty}
    >
      <div className="flex flex-col gap-5">
        <TemplatePreview name={name} form={form} accounts={accounts} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="template-name" className="text-sm text-muted-foreground">
            {t("templates.form.name")}
          </label>
          <div className="relative">
            <Input
              id="template-name"
              value={name}
              maxLength={templatesContract.MOVEMENT_TEMPLATE_NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              placeholder={t("templates.form.namePlaceholder")}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "template-name-error" : undefined}
              className="h-11 pr-16 font-medium"
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dim tabular-nums"
              aria-hidden
            >
              {name.length}/{templatesContract.MOVEMENT_TEMPLATE_NAME_MAX}
            </span>
          </div>
          {nameError ? (
            <p id="template-name-error" className="text-xs text-destructive">
              {nameError}
            </p>
          ) : null}
        </div>
        <TransactionFormPanel
          value={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          accounts={accounts}
          selectable={selectable}
          editing={editing}
          templateMode
          customFields={
            shownFields.length > 0 ? (
              <CustomFieldInputs fields={shownFields} values={values} onChange={setFieldValue} />
            ) : null
          }
        />
      </div>
    </FormSurface>
  );
}
