import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts, customFields, transactions } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";
import { useCustomFields, useFieldValueMutations } from "../hooks/useCustomFields";
import { fieldsFor, sendable, shapeOf } from "../lib/fieldValues";
import { CustomFieldInputs } from "./CustomFieldInputs";

type Value = customFields.CustomFieldValue;

interface Props {
  transaction: transactions.Transaction;
  accounts: readonly accounts.BankAccount[];
}

/**
 * A movement's custom field values in its detail panel (specs/036), editable in
 * place — also on a movement that is read-only for every other purpose (it backs an
 * instalment, a statement payment): labelling it moves no money (FR-012). The edits
 * are held until "Guardar", so typing a text doesn't save on every keystroke.
 */
export function TransactionCustomFieldsSection({ transaction, accounts }: Readonly<Props>) {
  const { t } = useTranslation();
  const { data } = useCustomFields();
  const { setValues } = useFieldValueMutations();
  const saved = transaction.customFields ?? {};
  const [draft, setDraft] = useState<Record<string, Value> | null>(null);
  const values = draft ?? saved;

  const fields = fieldsFor(data ?? [], shapeOf(transaction, accounts), saved);
  if (fields.length === 0) return null;

  const changes: Record<string, Value | null> = {};
  for (const f of fields) {
    const next = sendable(f, values[f.id] ?? null);
    if ((saved[f.id] ?? null) !== next) changes[f.id] = next;
  }
  const dirty = Object.keys(changes).length > 0;

  const save = () =>
    setValues.mutate(
      { transactionId: transaction.id, values: changes },
      {
        onSuccess: () => {
          toast.success(t("customFields.toast.saved"));
          setDraft(null);
        },
        onError: (err: unknown) =>
          toast.error(
            err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("errors.INTERNAL_ERROR"),
          ),
      },
    );

  return (
    <section className="flex flex-col gap-2" aria-label={t("customFields.title")}>
      <h3 className="text-sm font-semibold">{t("customFields.title")}</h3>
      <CustomFieldInputs
        fields={fields}
        values={values}
        onChange={(fieldId, value) => {
          const next = { ...values };
          if (value === null) delete next[fieldId];
          else next[fieldId] = value;
          setDraft(next);
        }}
        disabled={setValues.isPending}
      />
      {dirty ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={setValues.isPending}>
            {t("common.save")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
