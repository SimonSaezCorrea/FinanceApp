import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, debts } from "@finance/contracts";
import { currencyScale, formatMoney, subtractMoney, toMoney } from "@finance/money";

import {
  formatTypedAmount,
  groupingLocaleFor,
  parseTypedAmount,
} from "../../../shared/lib/amountInput";
import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { SearchableSelect } from "@finance/ui/src/shared/ui/searchable-select";
import { calcRemaining, coveredInstallments, dueInfo, nextPaymentAmount } from "../lib/debtMetrics";
import { debtSchedule } from "../lib/debtSchedule";

interface DebtPayPanelProps {
  /** The debt to register a payment for, or null when the panel is closed. */
  readonly debt: debts.Debt | null;
  readonly accounts: accountsContract.BankAccount[];
  /** The chosen payment source/destination account — sent as `settle`'s/
   * `register-payment`'s own `accountId` body field, which actually moves the
   * money (an INCOME on an `OWED_TO_YOU` debt, an EXPENSE on `YOU_OWE`). */
  readonly payAccountId: string;
  readonly onPayAccountChange: (id: string) => void;
  /** What actually arrived/left — canonical decimal string, prefilled with the
   * rest of the current instalment and editable: less leaves the difference
   * pending, more counts toward the next instalments. */
  readonly amount: string;
  readonly onAmountChange: (amount: string) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
  readonly submitting?: boolean;
}

/**
 * "Registrar abono": the amount that really arrived (or left), prefilled with
 * what the current instalment still asks for and editable — paying 21.663 on a
 * 21.664 instalment keeps $1 pending for later. Previews the progress and what
 * stays pending; the route sends it to `register-payment`, which settles the
 * debt by itself once nothing is left.
 */
export function DebtPayPanel({
  debt,
  accounts,
  payAccountId,
  onPayAccountChange,
  amount,
  onAmountChange,
  onOpenChange,
  onConfirm,
  submitting = false,
}: Readonly<DebtPayPanelProps>) {
  const { t, i18n } = useTranslation();
  // Retained through the close so the panel can play its exit animation
  // instead of vanishing the instant `debt` clears.
  const d = useLastNonNull(debt);
  if (d === null) return null;

  const hasInstallments = d.totalInstallments > 1;
  const schedule = debtSchedule(d);
  const next = schedule.find((r) => r.status === "next") ?? schedule[schedule.length - 1]!;
  const due = dueInfo(next.dueDate ? next.dueDate.toISOString() : null);

  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: d.currency });
  const locale = groupingLocaleFor(d.currency, i18n.language);

  const pending = calcRemaining(d);
  const suggested = nextPaymentAmount(d);
  const typed = toMoney(amount.trim() === "" || amount.endsWith(".") ? amount + "0" : amount);
  const tooMuch = typed.greaterThan(toMoney(pending));
  const validAmount = typed.greaterThan(0) && !tooMuch;
  const short = validAmount && typed.lessThan(toMoney(suggested));

  // Progress after this payment: the instalments what has arrived fully covers.
  const paidAfter = toMoney(d.paidAmount).plus(validAmount ? typed : 0);
  const coveredAfter = coveredInstallments(d, paidAfter.toString());
  const pct = Math.round((coveredAfter / d.totalInstallments) * 100);
  const pendingAfterRaw = subtractMoney(pending, validAmount ? typed.toString() : "0");
  const pendingAfter = toMoney(pendingAfterRaw).isNegative() ? "0.0000" : pendingAfterRaw;

  // Only accounts that could ACTUALLY receive/pay this debt: same currency
  // (no FX in this app) and not a CREDIT_CARD (settling debt with debt is
  // refused server-side, `DEBT_PAYMENT_FROM_CREDIT_ACCOUNT`) — narrower than
  // the full list so the picker never offers a choice the API would reject.
  const eligibleAccounts = accounts.filter(
    (a) => a.currency === d.currency && a.type !== "CREDIT_CARD",
  );
  const accountOptions = eligibleAccounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${formatMoney(a.currentBalance, { currency: a.currency, locale: i18n.language })}`,
  }));

  return (
    <FormSurface
      open={debt !== null}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("debts.pay.eyebrow")}
      title={d.counterparty}
      description={
        hasInstallments
          ? t("debts.pay.subtitleInstallment", {
              sequence: next.sequence,
              total: d.totalInstallments,
              concept: d.title ?? "",
            })
          : t("debts.pay.subtitleSingle", { concept: d.title ?? "" })
      }
      submitLabel={hasInstallments ? t("debts.card.registerPayment") : t("debts.card.markPaid")}
      canSubmit={payAccountId !== "" && validAmount}
      submitting={submitting}
      onSubmit={onConfirm}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-4">
          <label htmlFor="debt-pay-amount" className="text-xs text-muted-foreground">
            {t("debts.pay.amount")}
          </label>
          <div className="flex items-baseline gap-2">
            <input
              id="debt-pay-amount"
              inputMode="decimal"
              value={formatTypedAmount(amount, locale)}
              onChange={(e) =>
                onAmountChange(parseTypedAmount(e.target.value, locale, currencyScale(d.currency)))
              }
              placeholder="0"
              aria-invalid={tooMuch || undefined}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
            />
            <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
          </div>
          <p className={tooMuch ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {tooMuch
              ? t("debts.pay.amountTooHigh", { pending: money(pending) })
              : short
                ? t("debts.pay.amountShort", {
                    rest: money(toMoney(suggested).minus(typed).toString()),
                  })
                : t("debts.pay.amountHint", { suggested: money(suggested) })}
          </p>
        </div>

        <div className="flex flex-col">
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
              {coveredAfter}/{d.totalInstallments} · {pct}%
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
