import type { accounts as accountsContract, installments } from "@finance/contracts";
import { formatMoney, subtractMoney, toMoney } from "@finance/money";
import { useTranslation } from "react-i18next";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { DateField } from "../../../shared/ui/date-field";
import { DetailRow } from "../../../shared/ui/detail-row";
import { FormSurface } from "../../../shared/ui/overlay";
import { SearchableSelect } from "../../../shared/ui/searchable-select";

/** Everything the payment form edits. Owned by the caller so it survives a re-render
 *  of the list behind the panel. */
export interface PayInstallmentFormValue {
  fromAccountId: string;
  /** Credited to the instalment, in the PLAN's currency. */
  amount: string;
  /** Charged to the account, in ITS currency. Only used when the two differ. */
  chargedAmount: string;
  date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: installments.InstallmentPlan;
  payment: installments.InstallmentPayment;
  accounts: accountsContract.BankAccount[];
  value: PayInstallmentFormValue;
  onChange: (patch: Partial<PayInstallmentFormValue>) => void;
  onSubmit: () => void;
  submitting?: boolean;
}

/**
 * Paying one instalment: the amount owed prefilled, the account it comes out of, and
 * the date it really happened.
 *
 * The two-currency block (FR-029) is the part worth reading: when the paying account
 * is not in the plan's currency, the form asks for BOTH figures and converts neither
 * — this app has no exchange rate, so proposing a converted number would be inventing
 * one. What settles the debt is the plan-currency figure; what leaves the account is
 * the account-currency one.
 */
export function PayInstallmentPanel({
  open,
  onOpenChange,
  plan,
  payment,
  accounts,
  value,
  onChange,
  onSubmit,
  submitting = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  // FR-028b: settling debt with debt moves no money and would distort the pool —
  // the same refusal a transfer already makes for a credit destination. Excluded
  // here rather than only refused by the API: an option that can only fail is not
  // an option.
  const selectable = accounts.filter((a) => a.type !== "CREDIT_CARD");
  const account = selectable.find((a) => a.id === value.fromAccountId) ?? null;
  const needsAccount = plan.generatesMovementOnPay;
  const differentCurrency = account !== null && account.currency !== plan.currency;

  const planMoney = (amount: string) =>
    formatMoney(amount, { currency: plan.currency, locale: i18n.language });
  const accountMoney = (amount: string) =>
    formatMoney(amount, { currency: account?.currency ?? plan.currency, locale: i18n.language });

  const owed = payment.dueAmount;
  const credited = value.amount.trim() === "" ? "0" : value.amount;
  const shortfall = subtractMoney(owed, credited);
  const charged = differentCurrency ? value.chargedAmount : value.amount;

  const balanceAfter =
    account && charged.trim() !== ""
      ? subtractMoney(account.currentBalance, charged)
      : (account?.currentBalance ?? null);

  const canSubmit =
    toMoney(credited).greaterThan(0) &&
    (!needsAccount || account !== null) &&
    (!differentCurrency || toMoney(value.chargedAmount || "0").greaterThan(0));

  const accountOptions = selectable.map((a) => ({
    value: a.id,
    label: `${a.name} · ${formatMoney(a.currentBalance, { currency: a.currency, locale: i18n.language })}`,
  }));

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("installments.pay.eyebrow")}
      title={t("installments.pay.title", {
        sequence: payment.sequence,
        total: plan.installmentCount,
      })}
      description={plan.title}
      submitLabel={t("installments.payment.pay")}
      canSubmit={canSubmit}
      submitting={submitting}
      onSubmit={onSubmit}
    >
      <div className="flex flex-col gap-5">
        {/* The amount owed is the protagonist and the default: prefilled with the
            instalment's scheduled amount PLUS whatever it inherited (FR-016a). */}
        <div className="flex items-baseline gap-3 border-b border-border pb-3">
          <input
            inputMode="numeric"
            data-testid="installment-amount"
            value={formatAmountDisplay(
              value.amount,
              groupingLocaleFor(plan.currency, i18n.language),
            )}
            onChange={(e) => onChange({ amount: e.target.value.replace(/\D/g, "") })}
            placeholder="0"
            aria-label={t("installments.pay.amount")}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-4xl font-bold tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {plan.currency}
          </span>
        </div>

        <div className="flex flex-col">
          <DetailRow label={t("installments.pay.owed")} value={planMoney(owed)} />

          {payment.carriedOverAmount !== "0.0000" && (
            <DetailRow
              label={t("installments.pay.carriedIn")}
              value={planMoney(payment.carriedOverAmount)}
            />
          )}

          {needsAccount ? (
            <DetailRow label={t("installments.pay.account")}>
              <SearchableSelect
                id="installment-account"
                variant="inline"
                className="w-auto"
                value={value.fromAccountId}
                onChange={(fromAccountId) => onChange({ fromAccountId })}
                options={accountOptions}
                placeholder={t("installments.pay.selectAccount")}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("installments.pay.account")}
              />
            </DetailRow>
          ) : (
            /* FR-037: no account at all on a CREDIT-card plan — there is no movement
               to attribute to one. */
            <DetailRow
              label={t("installments.pay.account")}
              value={t("installments.pay.noMovement")}
            />
          )}

          <DetailRow label={t("installments.pay.date")}>
            <DateField
              id="installment-date"
              variant="inline"
              value={value.date}
              onChange={(date) => onChange({ date })}
              aria-label={t("installments.pay.date")}
            />
          </DetailRow>

          {needsAccount && (
            <>
              <DetailRow
                label={t("installments.pay.balanceBefore")}
                value={account ? accountMoney(account.currentBalance) : "—"}
              />
              <DetailRow
                label={t("installments.pay.balanceAfter")}
                value={balanceAfter === null ? "—" : accountMoney(balanceAfter)}
              />
            </>
          )}

          {/* FR-021: whatever the payment leaves uncovered moves to the next unpaid
              instalment. Said before confirming, not discovered afterwards. */}
          {toMoney(shortfall).greaterThan(0) && (
            <DetailRow
              label={t("installments.pay.carriesForward")}
              value={<span className="text-warning">{planMoney(shortfall)}</span>}
            />
          )}
          {toMoney(shortfall).lessThan(0) && (
            <DetailRow
              label={t("installments.pay.appliedToNext")}
              value={planMoney(subtractMoney("0", shortfall))}
            />
          )}
        </div>

        {differentCurrency && account && (
          <section
            data-testid="dual-currency"
            className={cn(
              "flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/5 p-3",
            )}
          >
            <p className="text-xs text-muted-foreground">
              {t("installments.pay.differentCurrency", {
                planCurrency: plan.currency,
                accountCurrency: account.currency,
              })}
            </p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {t("installments.pay.chargedAmount", { currency: account.currency })}
              </span>
              <input
                inputMode="numeric"
                data-testid="installment-charged"
                value={formatAmountDisplay(
                  value.chargedAmount,
                  groupingLocaleFor(account.currency, i18n.language),
                )}
                onChange={(e) => onChange({ chargedAmount: e.target.value.replace(/\D/g, "") })}
                placeholder="0"
                className="h-8 w-40 border-0 bg-transparent p-0 text-right text-base font-semibold tabular-nums text-foreground focus-visible:outline-none"
                aria-label={t("installments.pay.chargedAmount", { currency: account.currency })}
              />
            </label>
          </section>
        )}
      </div>
    </FormSurface>
  );
}

/** The form's opening state for one instalment: everything owed, from the account the
 *  plan remembers, dated today (FR-016). */
export function initialPayValue(
  plan: installments.InstallmentPlan,
  payment: installments.InstallmentPayment,
  today: string,
): PayInstallmentFormValue {
  return {
    fromAccountId: plan.paymentAccountId ?? "",
    // Trimmed of its trailing zeros: the field is a plain figure the user edits,
    // not the stored 4-decimal representation.
    amount: toMoney(payment.dueAmount).toString(),
    chargedAmount: "",
    date: today,
  };
}

/** What the panel sends to the API. `chargedAmount` travels only when the two
 *  currencies really differ — otherwise the server derives it from `amount`. */
export function toPayBody(
  value: PayInstallmentFormValue,
  plan: installments.InstallmentPlan,
  account: { currency: string } | null,
): installments.PayInstallment {
  const differentCurrency = account !== null && account.currency !== plan.currency;
  return {
    fromAccountId: plan.generatesMovementOnPay ? value.fromAccountId : null,
    amount: value.amount,
    chargedAmount: differentCurrency ? value.chargedAmount : null,
    paidAt: new Date(value.date).toISOString(),
  };
}
