import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts, customFields, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "@finance/client";
import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { FormSelectField } from "../../../shared/ui/form";
import { transactionsApi } from "../api/transactionsApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The yes/no field the list is filtered by. */
  field: customFields.CustomField;
  /** The value the covered movements take (the opposite of the one filtered). */
  value: boolean;
  target: transactions.CoverTransfer["target"];
  count: number;
  /** The sum of the movements and their one currency — `null` when they mix
   * currencies, which the transfer can't take. */
  amount: { value: string; currency: string } | null;
  accounts: readonly accounts.BankAccount[];
  onDone: () => void;
}

/**
 * "Transferir pendientes" (specs/036, US6): before confirming, the amount, how many
 * movements and both accounts (FR-021); confirming makes ONE transfer for the sum
 * and gives the movements the field's value — or neither, if the transfer can't be
 * made (FR-022). Retry-safe with its own `Idempotency-Key` (FR-024).
 */
export function CoverTransferPanel({
  open,
  onOpenChange,
  field,
  value,
  target,
  count,
  amount,
  accounts: accountList,
  onDone,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const idempotencyKey = useIdempotencyKey();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  const eligible = accountList.filter(
    (a) => a.status === "ACTIVE" && (!amount || a.currency === amount.currency),
  );
  const options = (exclude: string) =>
    eligible
      .filter((a) => a.id !== exclude)
      .map((a) => ({ value: a.id, label: a.name, description: t(`accounts.type.${a.type}`) }));

  const cover = useMutation({
    mutationFn: (body: transactions.CoverTransfer) =>
      transactionsApi.transfer.cover(body, idempotencyKey.current()),
    onSuccess: (result) => {
      idempotencyKey.reset();
      void qc.invalidateQueries({ queryKey: ["transactions"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      void qc.invalidateQueries({ queryKey: ["custom-fields"] });
      toast.success(t("customFields.cover.done", { count: result.covered }));
      onDone();
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("errors.INTERNAL_ERROR"),
      ),
  });

  const valueLabel = value ? t("customFields.values.yes") : t("customFields.values.no");

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={field.name}
      title={t("customFields.cover.title")}
      description={t("customFields.cover.description", { count, value: valueLabel })}
      submitLabel={t("customFields.cover.confirm")}
      canSubmit={Boolean(amount && fromId && toId && fromId !== toId)}
      submitting={cover.isPending}
      onSubmit={() =>
        cover.mutate({
          fieldId: field.id,
          target,
          value,
          fromBankAccountId: fromId,
          toBankAccountId: toId,
        })
      }
    >
      <div className="flex flex-col">
        <DetailRow
          label={t("customFields.cover.amount")}
          value={
            amount
              ? formatMoney(amount.value, { currency: amount.currency, locale: i18n.language })
              : "—"
          }
        />
        <DetailRow label={t("customFields.cover.movements")} value={String(count)} />
        <DetailRow label={t("customFields.cover.markAs")} value={`${field.name}: ${valueLabel}`} />
        <FormSelectField
          id="cover-from"
          label={t("customFields.cover.from")}
          value={fromId}
          onChange={setFromId}
          options={options(toId)}
        />
        <FormSelectField
          id="cover-to"
          label={t("customFields.cover.to")}
          value={toId}
          onChange={setToId}
          options={options(fromId)}
        />
      </div>
    </FormSurface>
  );
}
