import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts } from "@finance/contracts";
import { formatMoney, subtractMoney, toMoney } from "@finance/money";

import { DetailRow } from "../../../shared/ui/detail-row";
import { FormSurface } from "../../../shared/ui/overlay";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { dueInfo, leftAmount } from "../lib/debtMetrics";
import { debtSchedule } from "../lib/debtSchedule";

interface DebtPayPanelProps {
  readonly debt: debts.Debt;
  readonly accounts: accountsContract.BankAccount[];
  /** The chosen payment source/destination account — sent as `settle`'s/
   * `register-payment`'s own `accountId` body field, which actually moves the
   * money (an INCOME on an `OWED_TO_YOU` debt, an EXPENSE on `YOU_OWE`). */
  readonly payAccountId: string;
  readonly onPayAccountChange: (id: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly submitting?: boolean;
}

/**
 * "Registrar abono": confirms one instalment (or the single payment) against
 * the derived schedule, previews the progress it produces, and — on confirm —
 * calls `registerPayment` (several instalments left) or `settle` (this was the
 * last one / a single-payment debt), never both.
 */
export function DebtPayPanel({
  debt,
  accounts,
  payAccountId,
  onPayAccountChange,
  onOpenChange,
  onConfirm,
  submitting = false,
}: Readonly<DebtPayPanelProps>) {
  const { t, i18n } = useTranslation();
  const hasInstallments = debt.totalInstallments > 1;
  const schedule = debtSchedule(debt);
  const next = schedule[debt.paidInstallments] ?? schedule[schedule.length - 1]!;
  const due = dueInfo(next.dueDate ? next.dueDate.toISOString() : null);

  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: debt.currency });

  const newPaid = debt.paidInstallments + 1;
  const pct = Math.round((newPaid / debt.totalInstallments) * 100);
  const pendingAfterRaw = subtractMoney(leftAmount(debt), next.amount);
  const pendingAfter = toMoney(pendingAfterRaw).isNegative() ? "0.0000" : pendingAfterRaw;

  // Only accounts that could ACTUALLY receive/pay this debt: same currency
  // (no FX in this app) and not a CREDIT_CARD (settling debt with debt is
  // refused server-side, `DEBT_PAYMENT_FROM_CREDIT_ACCOUNT`) — narrower than
  // the full list so the picker never offers a choice the API would reject.
  const eligibleAccounts = accounts.filter(
    (a) => a.currency === debt.currency && a.type !== "CREDIT_CARD",
  );
  const accountOptions = eligibleAccounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${formatMoney(a.currentBalance, { currency: a.currency, locale: i18n.language })}`,
  }));

  return (
    <FormSurface
      open
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("debts.pay.eyebrow")}
      title={debt.counterparty}
      description={
        hasInstallments
          ? t("debts.pay.subtitleInstallment", {
              sequence: newPaid,
              total: debt.totalInstallments,
              concept: debt.title ?? "",
            })
          : t("debts.pay.subtitleSingle", { concept: debt.title ?? "" })
      }
      submitLabel={hasInstallments ? t("debts.card.registerPayment") : t("debts.card.markPaid")}
      canSubmit={payAccountId !== ""}
      submitting={submitting}
      onSubmit={onConfirm}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col">
          <DetailRow label={t("debts.pay.amount")} value={money(next.amount)} />
          <DetailRow
            label={t("debts.pay.due")}
            value={
              next.dueDate ? (
                <span className={due.overdue ? "text-destructive" : undefined}>
                  {next.dueDate.toLocaleDateString(i18n.language, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              ) : (
                t("debts.due.noDate")
              )
            }
          />
          <DetailRow label={t("debts.pay.account")}>
            <SearchableSelect
              id="debt-pay-account"
              variant="inline"
              className="w-auto"
              value={payAccountId}
              onChange={onPayAccountChange}
              options={accountOptions}
              placeholder={t("debts.pay.selectAccount")}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("debts.pay.account")}
            />
          </DetailRow>
        </div>

        <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
          <span className="text-xs font-medium text-muted-foreground">
            {t("debts.pay.previewTitle")}
          </span>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("debts.pay.previewProgress")}</span>
            <span className="font-medium tabular-nums">
              {newPaid}/{debt.totalInstallments} · {pct}%
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("debts.pay.previewPending")}</span>
            <span className="font-medium tabular-nums">{money(pendingAfter)}</span>
          </div>
        </div>
      </div>
    </FormSurface>
  );
}
