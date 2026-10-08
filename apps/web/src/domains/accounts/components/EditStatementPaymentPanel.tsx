import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { currencyScale, formatMoney, subtractMoney, toMoney } from "@finance/money";

import { useCurrencies } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import {
  formatTypedAmount,
  groupingLocaleFor,
  parseTypedAmount,
} from "../../../shared/lib/amountInput";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { FormSurface } from "../../../shared/ui/overlay";
import { localDay } from "../../exchange-rates/lib/day";
import { useAccountMutations, useAccounts } from "../hooks/useAccounts";
import { useSuggestedAmount } from "../hooks/useSuggestedAmount";

/** "54500.0000" → "54500", "50.4100" → "50.41": the form a person types it in. */
function trimmed(amount: string): string {
  return amount.includes(".") ? amount.replace(/\.?0+$/, "") : amount;
}

/** A typed amount as a Decimal-safe string: empty or half-typed ("50.") reads as 0. */
function asMoney(text: string): string {
  const cleaned = text.endsWith(".") ? text.slice(0, -1) : text;
  return cleaned === "" ? "0" : cleaned;
}

/**
 * Correct what was actually paid on a settled period — a mistyped figure, or a
 * second transfer that the app never saw.
 *
 * Only the PAYMENT is editable here: the period's own total comes from its real
 * movements and is only ever recomputed ("Sincronizar pagos"), never typed in.
 * The panel therefore shows the total as a fixed row and asks for one number,
 * previewing what would be carried into the next period — the whole reason the
 * figure matters.
 *
 * Spec 030: a period in ANOTHER currency was paid with two figures, so it is corrected with
 * two — the period's own and what left the source account in ITS currency, suggested from
 * the dollars and editable.
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
  const { data: currencies } = useCurrencies();
  const { data: allAccounts } = useAccounts();
  const { updateStatementPayment } = useAccountMutations();
  const [amount, setAmount] = useState("");
  // Reopening on another period must not keep the previous one's figure — reset
  // during render (React's recommended pattern) rather than in an effect, which
  // would cascade an extra render on every open.
  const [seenStatementId, setSeenStatementId] = useState<string | null>(null);
  // The amount as a person types it ("54500", "50.41"): a decimal money string displayed
  // digit-by-digit is what produced the garbled "54500,0000" this panel used to show.
  // Comparing dirtiness against the un-trimmed `statement.paidAmount` would flag "sin
  // guardar" on open, before any real edit — the baseline has to be this SAME form.
  const initialAmount = statement ? trimmed(statement.paidAmount) : "";
  if (statement && statement.id !== seenStatementId) {
    setSeenStatementId(statement.id);
    setAmount(initialAmount);
  }

  const currency = statement?.currency ?? account.currency;
  const foreign = statement !== null && statement.currency !== account.currency;
  const source = (allAccounts ?? []).find((a) => a.id === statement?.paidFromAccountId);
  // Only a period that really moved money out of an account in a third currency has a
  // second figure to correct (an imported, bookkeeping-only one has no movements).
  const needsCharged =
    foreign &&
    source !== undefined &&
    source.currency !== currency &&
    statement?.paidTransactionId !== null;
  const parsed = toMoney(asMoney(amount));
  const valid =
    parsed.greaterThan(0) && (statement === null || parsed.lessThanOrEqualTo(statement.amount));
  const charge = useSuggestedAmount({
    amount: valid ? parsed.toString() : "",
    fromCurrency: currency,
    toCurrency: source?.currency ?? "",
    date: statement?.paidAt ? localDay(new Date(statement.paidAt)) : localDay(),
  });
  const charged = needsCharged ? charge.value : "";
  const chargedMissing = needsCharged && toMoney(asMoney(charged)).lessThanOrEqualTo(0);

  if (!statement) return null;

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const leftover = valid ? subtractMoney(statement.amount, parsed) : null;
  const locale = groupingLocaleFor(currency, i18n.language);
  const sourceLocale = source ? groupingLocaleFor(source.currency, i18n.language) : locale;
  const dirty = amount !== initialAmount || (needsCharged && charge.edited);

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
      canSubmit={valid && dirty && !chargedMissing}
      dirty={dirty}
      submitting={updateStatementPayment.isPending}
      onSubmit={() =>
        updateStatementPayment.mutate(
          {
            id: account.id,
            statementId: statement.id,
            amount: asMoney(amount),
            chargedAmount: needsCharged ? charged : undefined,
          },
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
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("accounts.detail.payAmountLabel")}</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="shrink-0 text-2xl font-bold text-accent" aria-hidden>
                {resolveCurrencySymbol(currency, currencies, i18n.language)}
              </span>
              <input
                inputMode="decimal"
                value={formatTypedAmount(amount, locale)}
                onChange={(e) =>
                  setAmount(parseTypedAmount(e.target.value, locale, currencyScale(currency)))
                }
                placeholder="0"
                aria-label={t("accounts.detail.payAmountLabel")}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
              />
              <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
            </div>
          </div>

          {/* What the period is made of — same two rows `PayStatementPanel` opens
              with, so correcting a payment reads in the same terms as making one. */}
          <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("accounts.detail.billingAmount")}</dt>
              <dd className="font-medium tabular-nums">{fmt(statement.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t("accounts.detail.editPaymentCurrent")}</dt>
              <dd className="font-medium tabular-nums">{fmt(statement.paidAmount)}</dd>
            </div>
          </dl>
        </div>

        {needsCharged && source ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {t("accounts.pay.debitedLabel", { currency: source.currency })}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-xl font-bold" aria-hidden>
                {resolveCurrencySymbol(source.currency, currencies, i18n.language)}
              </span>
              <input
                inputMode="decimal"
                value={formatTypedAmount(charged, sourceLocale)}
                onChange={(e) =>
                  charge.setValue(
                    parseTypedAmount(e.target.value, sourceLocale, currencyScale(source.currency)),
                  )
                }
                placeholder="0"
                aria-label={t("accounts.pay.debitedLabel", { currency: source.currency })}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
            </div>
            {charge.noRate ? (
              <p className="text-xs text-muted-foreground">
                {t("exchangeRates.suggestion.noRate")}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The consequence, not a validation message: what the correction leaves
            owed in the NEXT period, which is where the shortfall lives. */}
        {leftover !== null ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-xs">
            <span className="text-muted-foreground">{t("accounts.detail.payRemainingAfter")}</span>
            <span className="font-medium tabular-nums text-warning">{fmt(leftover)}</span>
          </div>
        ) : null}

        <p className="border-l-2 border-brand/40 pl-3 text-xs text-muted-foreground">
          {t("accounts.detail.editPaymentCascadeHint")}
        </p>
      </div>
    </FormSurface>
  );
}
