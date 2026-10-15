import { Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { ApiRequestError } from "@finance/client";
import { currencyScale, formatMoney, toMoney } from "@finance/money";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";

import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import {
  formatTypedAmount,
  groupingLocaleFor,
  parseTypedAmount,
} from "../../../shared/lib/amountInput";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { localDay } from "../../exchange-rates/lib/day";
import { useCurrencies } from "../../reference/hooks/useReference";
import { useAccountMutations } from "../hooks/useAccounts";
import { useSuggestedAmount } from "../hooks/useSuggestedAmount";

/** A typed amount as a Decimal-safe string: empty or half-typed ("50.") reads as 0. */
function asMoney(text: string): string {
  const cleaned = text.endsWith(".") ? text.slice(0, -1) : text;
  return cleaned === "" ? "0" : cleaned;
}

/**
 * Spec 028 US3: the bank converted an overdue period in another currency and charged it to the
 * account's own currency, in the next statement. The person types that charge as it appears on
 * the bank's statement; today's recorded rate only suggests it (editable, never compared by the
 * server). Confirming settles the period (TRANSFERRED) and records the charge in the open period
 * of the account's currency.
 */
export function TransferStatementPanel({
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
  const { transferStatement } = useAccountMutations();
  const idempotencyKey = useIdempotencyKey();
  // Reopening on another period starts from its own suggestion.
  const [seenStatementId, setSeenStatementId] = useState<string | null>(null);
  const charge = useSuggestedAmount({
    amount: statement?.remainingAmount ?? "",
    fromCurrency: statement?.currency ?? account.currency,
    toCurrency: account.currency,
    date: localDay(),
  });
  if (statement && statement.id !== seenStatementId) {
    setSeenStatementId(statement.id);
    idempotencyKey.reset();
  }
  if (!statement) return null;

  const owed = formatMoney(statement.remainingAmount, {
    locale: i18n.language,
    currency: statement.currency,
  });
  const locale = groupingLocaleFor(account.currency, i18n.language);
  const valid = toMoney(asMoney(charge.value)).greaterThan(0);

  return (
    <FormSurface
      open={statement !== null}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("accounts.transfer.eyebrow", { currency: account.currency })}
      title={t("accounts.detail.payPeriodTitle", {
        date: new Date(statement.periodStart).toLocaleDateString(i18n.language),
      })}
      description={t("accounts.transfer.description", { currency: account.currency })}
      submitLabel={t("accounts.transfer.submit")}
      canSubmit={valid}
      submitting={transferStatement.isPending}
      onSubmit={() =>
        transferStatement.mutate(
          {
            id: account.id,
            statementId: statement.id,
            body: { amount: asMoney(charge.value) },
            idempotencyKey: idempotencyKey.current(),
          },
          {
            onSuccess: () => {
              idempotencyKey.reset();
              toast.success(t("accounts.transfer.success"));
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t("accounts.transfer.owed")}</span>
          <span className="font-semibold tabular-nums">{owed}</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t("accounts.transfer.amountLabel", { currency: account.currency })}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 text-2xl font-bold text-accent" aria-hidden>
              {resolveCurrencySymbol(account.currency, currencies, i18n.language)}
            </span>
            <input
              inputMode="decimal"
              value={formatTypedAmount(charge.value, locale)}
              onChange={(e) =>
                charge.setValue(
                  parseTypedAmount(e.target.value, locale, currencyScale(account.currency)),
                )
              }
              placeholder="0"
              aria-label={t("accounts.transfer.amountLabel", { currency: account.currency })}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums text-accent placeholder:text-accent/50 focus-visible:outline-none"
            />
            <Pencil aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            {charge.noRate
              ? t("exchangeRates.suggestion.noRate")
              : t("accounts.transfer.amountHint")}
          </p>
        </div>

        <p className="border-l-2 border-brand/40 pl-3 text-xs text-muted-foreground">
          {t("accounts.transfer.consequence", { currency: account.currency })}
        </p>
      </div>
    </FormSurface>
  );
}
