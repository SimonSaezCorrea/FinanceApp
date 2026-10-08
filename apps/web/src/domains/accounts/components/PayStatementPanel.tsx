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
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { cn } from "../../../shared/lib/cn";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { FormDateField, FormSelectField, FormTextField } from "../../../shared/ui/form";
import { SidePanel } from "../../../shared/ui/overlay";
import { Segmented } from "../../../shared/ui/segmented";
import { formatRate } from "../../exchange-rates/lib/formatRate";
import { useAccountMutations, useAccounts } from "../hooks/useAccounts";
import { useSuggestedAmount } from "../hooks/useSuggestedAmount";
import { STATEMENT_STATUS_VARIANT } from "../lib/statementStatus";

type PayMode = "total" | "minimum" | "custom";

/** `<input type="date">` wants YYYY-MM-DD in LOCAL time — `toISOString` would
 *  hand it the UTC day, which is the previous one for anyone west of Greenwich. */
function todayLocalISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** A typed amount as a Decimal-safe string: empty or half-typed ("50.") reads as 0. */
function asMoney(text: string): string {
  const cleaned = text.endsWith(".") ? text.slice(0, -1) : text;
  return cleaned === "" ? "0" : cleaned;
}

/**
 * Pay (or prepay) a statement, in the same right-side `SidePanel` the card and account
 * screens use: a header (period, account, card, status), what the period is made of, how
 * much to pay, from where, and the consequences.
 *
 * Paying moves real money, so the panel never hides a figure it knows: the breakdown of the
 * period, the balance left in the source account, and what would still be owed after a
 * partial payment. A source that can't cover the amount is flagged but never blocked — that
 * account may be settled elsewhere.
 *
 * Default source: THIS account, when it is the kind that holds money (a checking or sight
 * account that grew a credit card pays its own statement). A standalone credit line has no
 * balance of its own, so nothing is preselected.
 *
 * Spec 030: a statement in ANOTHER currency (US$) paid from an account in yet another (CLP)
 * takes two amounts — the statement's own and what the bank took out of the source. The
 * second one is SUGGESTED from the rate of the payment date and always editable; the
 * dollars are the base and editing the pesos never changes them. Nothing converted is sent
 * unless it is what the person sees. `intent="prepay"` abona the OPEN period instead: the
 * amount is always typed (there is no "everything" while it still accumulates).
 */
export function PayStatementPanel({
  account,
  statement,
  onOpenChange,
  intent = "pay",
}: Readonly<{
  account: accounts.BankAccount;
  statement: accounts.CreditStatement | null;
  onOpenChange: (v: boolean) => void;
  intent?: "pay" | "prepay";
}>) {
  const { t, i18n } = useTranslation();
  const { data: allAccounts } = useAccounts();
  const { data: currencies } = useCurrencies();
  const { payCreditStatement, prepayCreditStatement } = useAccountMutations();
  const idempotencyKey = useIdempotencyKey();
  const [fromAccountId, setFromAccountId] = useState("");
  const [mode, setMode] = useState<PayMode>("total");
  const [customAmount, setCustomAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayLocalISO);
  const [reference, setReference] = useState("");

  const prepay = intent === "prepay";
  // Every amount of the statement is in ITS currency, which is not always the account's.
  const currency = statement?.currency ?? account.currency;
  const foreign = statement !== null && statement.currency !== account.currency;

  const sources = (allAccounts ?? []).filter(
    (a) => a.type !== "CREDIT_CARD" && a.status === "ACTIVE",
  );
  const selfPayable = sources.some((a) => a.id === account.id);
  // Derived, not written into state by an effect: an effect would fire a second
  // render per open and fight a choice made before the accounts list loaded.
  const selected = fromAccountId || (selfPayable ? account.id : "");
  const from = sources.find((a) => a.id === selected);

  const money = (v: string, c: string) => formatMoney(v, { locale: i18n.language, currency: c });

  const remaining = statement?.remainingAmount ?? "0";
  const minimum = statement?.minimumAmount ?? null;
  const minimumNumber = minimum === null ? 0 : Number(minimum);
  // A minimum bigger than what's left (a period already paid down past it) isn't
  // a payable option — offering it would only produce a rejected request.
  const minimumPayable =
    minimum !== null && minimumNumber > 0 && toMoney(minimum).lessThanOrEqualTo(remaining);

  // The amount this payment settles, in the statement's currency, as a string end to end.
  let amountText: string;
  if (prepay || mode === "custom") amountText = customAmount;
  else if (mode === "total") amountText = remaining;
  else amountText = minimum ?? "0";
  const amount = toMoney(asMoney(amountText));
  const overRemaining = amount.greaterThan(remaining);
  const invalidAmount = amount.lessThanOrEqualTo(0) || overRemaining;
  const leftAfter = toMoney(remaining).minus(amount.isNegative() ? 0 : amount);

  // Two amounts when a statement in another currency is paid from an account in a third.
  const needsCharged = foreign && from !== undefined && from.currency !== currency;
  const charge = useSuggestedAmount({
    amount: invalidAmount ? "" : amount.toString(),
    fromCurrency: currency,
    toCurrency: from?.currency ?? "",
    date: paidAt,
  });
  const charged = needsCharged ? charge.value : "";
  const chargedMoney = toMoney(asMoney(charged));
  const chargedMissing = needsCharged && chargedMoney.lessThanOrEqualTo(0);

  const insufficient = from
    ? needsCharged
      ? toMoney(from.currentBalance).lessThan(chargedMoney)
      : toMoney(from.currentBalance).lessThan(amount)
    : false;
  // Without a conversion the two balances cannot be put side by side (legacy case: an
  // account-currency statement paid from a source in another currency).
  const otherCurrency = from ? from.currency !== account.currency && !foreign : false;

  function close() {
    setFromAccountId("");
    setMode("total");
    setCustomAmount("");
    setPaidAt(todayLocalISO());
    setReference("");
    charge.reset();
    onOpenChange(false);
  }

  if (!statement) return null;

  const period = new Date(statement.periodStart).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // The card the statement belongs to: the account's primary credit card, whose
  // limit IS this pool (see the accounts domain rules).
  const primaryCard = account.cards.find((c) => c.kind === "CREDIT" && c.isPrimary);
  const subtitle = [account.name, primaryCard ? `•••• ${primaryCard.last4}` : null]
    .filter(Boolean)
    .join(" · ");

  const modeHint = () => {
    if (overRemaining) return t("errors.PAYMENT_EXCEEDS_REMAINING");
    if (prepay) return t("accounts.pay.prepayHint");
    if (mode === "total") return t("accounts.detail.payCoversTotal");
    if (mode === "minimum")
      return t("accounts.detail.payCoversMinimum", {
        percent: account.minimumPaymentPercent ?? "",
      });
    return t("accounts.detail.payCoversCustom");
  };

  const amountLocale = groupingLocaleFor(currency, i18n.language);
  const decimals = currencyScale(currency);
  const sourceDecimals = from ? currencyScale(from.currency) : 0;
  const sourceLocale = from ? groupingLocaleFor(from.currency, i18n.language) : i18n.language;

  const rateDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language);

  function onSuccess(message: string) {
    toast.success(message);
    // This attempt succeeded — reopening the panel for another payment later needs its
    // own, fresh key.
    idempotencyKey.reset();
    close();
  }
  const onError = (err: unknown) => {
    const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
    toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
  };

  function submit() {
    const base = {
      fromAccountId: selected,
      chargedAmount: needsCharged ? charged : undefined,
      paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      reference: reference.trim() || undefined,
    };
    if (prepay) {
      prepayCreditStatement.mutate(
        {
          id: account.id,
          statementId: statement!.id,
          body: { ...base, amount: amountText },
          idempotencyKey: idempotencyKey.current(),
        },
        { onSuccess: () => onSuccess(t("accounts.pay.prepaySuccess")), onError },
      );
      return;
    }
    payCreditStatement.mutate(
      {
        id: account.id,
        statementId: statement!.id,
        body: {
          ...base,
          // Omitted when paying in full: the server settles whatever is owed, so a figure
          // that went stale between opening this panel and pressing the button can't
          // underpay the period.
          amount: mode === "total" ? undefined : amountText,
        },
        idempotencyKey: idempotencyKey.current(),
      },
      { onSuccess: () => onSuccess(t("accounts.actions.payCreditSuccess")), onError },
    );
  }

  const pending = payCreditStatement.isPending || prepayCreditStatement.isPending;

  return (
    <SidePanel
      open={statement !== null}
      onOpenChange={(v) => !v && close()}
      eyebrow={prepay ? t("accounts.pay.prepayEyebrow") : t("accounts.detail.payEyebrow")}
      title={
        prepay
          ? t("accounts.pay.prepayTitle", { date: period })
          : t("accounts.detail.payPeriodTitle", { date: period })
      }
      description={subtitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="accent"
            disabled={!selected || invalidAmount || chargedMissing || pending}
            onClick={submit}
          >
            {/* The amount rides on the action: the last thing read before paying
                should be what gets paid, not a generic verb. */}
            {t(prepay ? "accounts.pay.prepayAction" : "accounts.detail.payAction", {
              amount: money(amount.isNegative() ? "0" : amount.toString(), currency),
            })}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Badge variant={STATEMENT_STATUS_VARIANT[statement.status]} className="self-start">
          {t(`accounts.detail.billingStatusValue.${statement.status}`)}
        </Badge>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
          {prepay ? null : (
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              aria-label={t("accounts.detail.paySummaryAmount")}
              options={[
                { value: "total", label: t("accounts.detail.payModeTotal") },
                {
                  value: "minimum",
                  label: t("accounts.detail.payModeMinimum"),
                  disabled: !minimumPayable,
                  disabledReason:
                    minimum === null || minimumNumber <= 0
                      ? t("accounts.detail.payMinimumUnset")
                      : t("accounts.detail.payMinimumCovered"),
                },
                { value: "custom", label: t("accounts.detail.payModeCustom") },
              ]}
            />
          )}

          <div>
            <p className="text-xs text-muted-foreground">{t("accounts.detail.paySummaryAmount")}</p>
            {prepay || mode === "custom" ? (
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="shrink-0 text-2xl font-bold text-accent" aria-hidden>
                  {resolveCurrencySymbol(currency, currencies, i18n.language)}
                </span>
                <input
                  inputMode="decimal"
                  value={formatTypedAmount(customAmount, amountLocale)}
                  onChange={(e) =>
                    setCustomAmount(parseTypedAmount(e.target.value, amountLocale, decimals))
                  }
                  placeholder="0"
                  aria-label={t("accounts.detail.payAmountLabel")}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
                />
                <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
              </div>
            ) : (
              <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-accent">
                {money(amount.toString(), currency)}
              </p>
            )}
            <p
              className={cn(
                "mt-1 text-xs",
                overRemaining ? "text-warning" : "text-muted-foreground",
              )}
            >
              {modeHint()}
            </p>
          </div>

          {/* What the period is made of — derived from its own movements. */}
          <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("accounts.detail.payBreakdownPurchases")}
              </dt>
              <dd className="font-medium tabular-nums">
                {money(statement.breakdown.purchases, currency)}
              </dd>
            </div>
            {statement.breakdown.installmentCount > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("accounts.detail.payBreakdownInstallments", {
                    count: statement.breakdown.installmentCount,
                  })}
                </dt>
                <dd className="font-medium tabular-nums">
                  {money(statement.breakdown.installments, currency)}
                </dd>
              </div>
            ) : null}
            {/* Debt the previous period couldn't cover: part of what's owed
                here, but not one of this period's own movements. */}
            {Number(statement.carriedOverAmount) > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("accounts.detail.payCarriedOver")}</dt>
                <dd className="font-medium tabular-nums text-warning">
                  {money(statement.carriedOverAmount, currency)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-col">
          <FormSelectField
            id="pay-from-account"
            label={t("accounts.detail.payFromAccount")}
            value={selected}
            onChange={setFromAccountId}
            placeholder={t("accounts.detail.payFromAccountPlaceholder")}
            options={sources.map((a) => ({
              value: a.id,
              label:
                a.id === account.id
                  ? `${a.name} · ${t("accounts.detail.payThisAccount")}`
                  : `${a.name} — ${money(a.currentBalance, a.currency)}`,
            }))}
          />

          {needsCharged && from ? (
            <div className="flex flex-col gap-1.5 border-b border-border py-3">
              <p className="text-xs text-muted-foreground">
                {t("accounts.pay.debitedLabel", { currency: from.currency })}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-xl font-bold" aria-hidden>
                  {resolveCurrencySymbol(from.currency, currencies, i18n.language)}
                </span>
                <input
                  inputMode="decimal"
                  value={formatTypedAmount(charged, sourceLocale)}
                  onChange={(e) =>
                    charge.setValue(parseTypedAmount(e.target.value, sourceLocale, sourceDecimals))
                  }
                  placeholder="0"
                  aria-label={t("accounts.pay.debitedLabel", { currency: from.currency })}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums placeholder:text-muted-foreground focus-visible:outline-none"
                />
                <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
              </div>
              {charge.suggestion ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    charge.suggestion.carried
                      ? "exchangeRates.suggestion.estimatedCarried"
                      : "exchangeRates.suggestion.estimated",
                    {
                      date: rateDay(
                        charge.suggestion.carried
                          ? charge.suggestion.valueDate
                          : charge.suggestion.rateDate,
                      ),
                      rate: formatRate(charge.suggestion.rate, i18n.language),
                    },
                  )}
                </p>
              ) : charge.noRate ? (
                <p className="text-xs text-muted-foreground">{t("exchangeRates.suggestion.noRate")}</p>
              ) : null}
              {charge.edited && charge.suggestion ? (
                <button
                  type="button"
                  onClick={charge.reset}
                  className="self-start text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  {t("exchangeRates.suggestion.useEstimate")}
                </button>
              ) : null}
            </div>
          ) : null}

          {from ? (
            <div className="flex flex-col gap-1.5 border-b border-border py-3 text-xs">
              {/* Only meaningful when what leaves is known in the account's own currency. */}
              {otherCurrency || (needsCharged && chargedMoney.lessThanOrEqualTo(0)) ? null : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("accounts.detail.payBalanceAfter")}
                  </span>
                  <span className={cn("font-medium tabular-nums", insufficient && "text-warning")}>
                    {money(
                      subtractMoney(from.currentBalance, needsCharged ? chargedMoney : amount),
                      from.currency,
                    )}
                  </span>
                </div>
              )}
              {leftAfter.greaterThan(0) && !prepay ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {t("accounts.detail.payRemainingAfter")}
                  </span>
                  <span className="font-medium tabular-nums text-warning">
                    {money(leftAfter.toString(), currency)}
                  </span>
                </div>
              ) : null}
              {insufficient ? (
                <p className="text-warning">{t("accounts.detail.payInsufficient")}</p>
              ) : null}
              {otherCurrency ? (
                <p className="text-muted-foreground">{t("accounts.detail.payDifferentCurrency")}</p>
              ) : null}
            </div>
          ) : null}

          <FormDateField
            id="pay-date"
            label={t("accounts.detail.payDate")}
            value={paidAt}
            onChange={setPaidAt}
          />
          <FormTextField
            id="pay-reference"
            label={t("accounts.detail.payReference")}
            value={reference}
            onChange={setReference}
            placeholder={t("accounts.detail.payReferencePlaceholder")}
            showEditIcon
          />
        </div>

        <p className="border-l-2 border-brand/40 pl-3 text-xs text-muted-foreground">
          {foreign
            ? t(prepay ? "accounts.pay.prepayCreatesMovement" : "accounts.pay.foreignCreatesMovement")
            : t("accounts.detail.payCreatesMovement")}
        </p>
      </div>
    </SidePanel>
  );
}
