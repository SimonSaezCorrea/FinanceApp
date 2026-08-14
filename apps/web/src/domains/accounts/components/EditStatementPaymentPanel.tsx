import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney, subtractMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { FormSurface } from "../../../shared/ui/overlay";
import { useAccountMutations } from "../hooks/useAccounts";

/**
 * Correct what was actually paid on a settled period — a mistyped figure, or a
 * second transfer that the app never saw.
 *
 * Only the PAYMENT is editable here: the period's own total comes from its real
 * movements and is only ever recomputed ("Sincronizar pagos"), never typed in.
 * The panel therefore shows the total as a fixed row and asks for one number,
 * previewing what would be carried into the next period — the whole reason the
 * figure matters.
 */
export function EditStatementPaymentPanel({
  account,
  statement,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
}>) {
  const { t, i18n } = useTranslation();
  const { updateStatementPayment } = useAccountMutations();
  const [amount, setAmount] = useState("");

  // Reopening on another period must not keep the previous one's figure.
  useEffect(() => {
    if (statement) setAmount(statement.paidAmount);
  }, [statement]);

  if (!statement) return null;

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= Number(statement.amount);
  const leftover = valid ? subtractMoney(statement.amount, amount) : null;

  return (
    <FormSurface
      open={statement !== null}
      onOpenChange={onOpenChange}
      mode="edit"
      surface="panel"
      eyebrow={t("accounts.detail.editPaymentEyebrow")}
      title={t("accounts.detail.payPeriodTitle", {
        date: new Date(statement.periodStart).toLocaleDateString(i18n.language),
      })}
      description={t("accounts.detail.editPaymentDescription")}
      canSubmit={valid && amount !== statement.paidAmount}
      dirty={amount !== statement.paidAmount}
      submitting={updateStatementPayment.isPending}
      onSubmit={() =>
        updateStatementPayment.mutate(
          { id: account.id, statementId: statement.id, amount },
          {
            onSuccess: () => {
              toast.success(t("accounts.detail.editPaymentSuccess"));
              onOpenChange(false);
            },
            onError: (e) =>
              toast.error(
                t(`errors.${e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR"}`, {
                  defaultValue: t("errors.INTERNAL_ERROR"),
                }),
              ),
          },
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-border bg-muted/40">
          <DetailRow label={t("accounts.detail.billingAmount")} value={fmt(statement.amount)} />
          <DetailRow
            label={t("accounts.detail.editPaymentCurrent")}
            value={fmt(statement.paidAmount)}
          />
        </div>

        <Field label={t("accounts.detail.payAmountLabel")}>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-12 text-2xl font-semibold tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        {/* The consequence, not a validation message: what the correction leaves
            owed in the NEXT period, which is where the shortfall lives. */}
        {leftover !== null ? (
          <div className="rounded-xl border border-border">
            <DetailRow label={t("accounts.detail.payRemainingAfter")} value={fmt(leftover)} />
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("accounts.detail.editPaymentCascadeHint")}
        </p>
      </div>
    </FormSurface>
  );
}
