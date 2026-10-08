import { Pencil } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { currencyScale } from "@finance/money";

import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { useAmountSuggestion } from "../../accounts/hooks/useSuggestedAmount";
import { formatRate } from "../../exchange-rates/lib/formatRate";
import {
  formatTypedAmount,
  groupingLocaleFor,
  parseTypedAmount,
} from "../../../shared/lib/amountInput";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import type { TransactionFormValue } from "./TransactionFormPanel";

interface Props {
  value: TransactionFormValue;
  onChange: (patch: Partial<TransactionFormValue>) => void;
  accounts: accounts.BankAccount[];
  selectable: accounts.BankAccount[];
  /**
   * Opened from inside one account: it IS the origin, shown as a fixed value.
   * Switching it here would move the transfer out of the view it was created
   * from — same reason the ordinary form hides its account selector.
   */
  lockedFrom?: boolean;
}

/**
 * Source/destination accounts and the amount that lands on the other side. No card field
 * (FR-019). The destination MAY be a `CREDIT_CARD` account: that is paying the
 * card — it lowers its used credit, and like every transfer it is money moving
 * between your own accounts, never income or spending.
 *
 * Spec 030: when the two accounts are in different currencies the destination amount is its
 * own field — the origin amount is the base, and for USD → CLP the pesos are SUGGESTED from
 * the rate of the movement's date, always editable. Editing them never changes the origin
 * amount; whatever the field shows when the form is saved is what is stored.
 */
export function TransferFields({
  value,
  onChange,
  accounts: all,
  selectable,
  lockedFrom = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const typeLabel = (accType: accounts.AccountType) => t(`accounts.type.${accType}`);

  // Both pickers share the same "Nombre / Tipo · Banco · Número" shape as the
  // ordinary account field — and each one excludes whatever the OTHER side
  // already picked, so the same account can't be both ends of its own transfer.
  const fromOptions = selectable
    .filter((a) => a.id !== value.toBankAccountId)
    .map((a) => ({ value: a.id, label: a.name, description: accountMetaLine(a, typeLabel) }));
  const toOptions = selectable
    .filter((a) => a.id !== value.bankAccountId)
    .map((a) => ({ value: a.id, label: a.name, description: accountMetaLine(a, typeLabel) }));

  const destination = all.find((a) => a.id === value.toBankAccountId);
  const crossCurrency = destination !== undefined && destination.currency !== value.currency;
  const { suggested, suggestion, noRate } = useAmountSuggestion({
    amount: value.amount,
    fromCurrency: value.currency,
    toCurrency: destination?.currency ?? "",
    date: value.date,
  });

  // The form keeps `amountIn` as the one value the submit reads: while the person has not
  // typed their own, it follows the estimate; same-currency transfers have no second amount
  // at all (the submit falls back to the origin's).
  useEffect(() => {
    if (value.amountInEdited) return;
    const next = crossCurrency ? (suggested ?? "") : "";
    if (value.amountIn !== next) onChange({ amountIn: next });
  }, [crossCurrency, suggested, value.amountInEdited, value.amountIn, onChange]);

  const destLocale = destination
    ? groupingLocaleFor(destination.currency, i18n.language)
    : i18n.language;
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language);

  return (
    <>
      <DetailRow label={t("transactions.form.fromAccount")}>
        {lockedFrom ? (
          <span className="font-medium">
            {all.find((a) => a.id === value.bankAccountId)?.name ?? "—"}
          </span>
        ) : (
          <SearchableSelect
            id="tx-from"
            variant="inline"
            className="w-auto"
            value={value.bankAccountId}
            onChange={(id) => {
              const acc = all.find((a) => a.id === id);
              onChange({
                bankAccountId: id,
                cardId: "",
                ...(acc ? { currency: acc.currency } : {}),
              });
            }}
            options={fromOptions}
            placeholder={t("transactions.form.selectAccount")}
            searchPlaceholder={t("common.search")}
            noResultsLabel={t("common.noResults")}
            aria-label={t("transactions.form.fromAccount")}
          />
        )}
      </DetailRow>

      <DetailRow label={t("transactions.form.toAccount")}>
        <SearchableSelect
          id="tx-to"
          variant="inline"
          className="w-auto"
          value={value.toBankAccountId}
          onChange={(toBankAccountId) => onChange({ toBankAccountId })}
          options={toOptions}
          placeholder={t("transactions.form.selectAccount")}
          searchPlaceholder={t("common.search")}
          noResultsLabel={t("common.noResults")}
          aria-label={t("transactions.form.toAccount")}
        />
      </DetailRow>

      {crossCurrency && destination ? (
        <div className="flex flex-col gap-1.5 border-b border-border py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {t("transactions.form.amountIn")} ({destination.currency})
            </span>
            <span className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={formatTypedAmount(value.amountIn, destLocale)}
                onChange={(e) =>
                  onChange({
                    amountIn: parseTypedAmount(
                      e.target.value,
                      destLocale,
                      currencyScale(destination.currency),
                    ),
                    amountInEdited: true,
                  })
                }
                placeholder="0"
                aria-label={`${t("transactions.form.amountIn")} (${destination.currency})`}
                className="w-40 min-w-0 border-0 bg-transparent p-0 text-right text-base font-semibold tabular-nums placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <Pencil aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </span>
          </div>
          {suggestion ? (
            <p className="text-xs text-muted-foreground">
              {t(
                suggestion.carried
                  ? "exchangeRates.suggestion.estimatedCarried"
                  : "exchangeRates.suggestion.estimated",
                {
                  date: day(suggestion.carried ? suggestion.valueDate : suggestion.rateDate),
                  rate: formatRate(suggestion.rate, i18n.language),
                },
              )}
            </p>
          ) : noRate ? (
            <p className="text-xs text-muted-foreground">{t("exchangeRates.suggestion.noRate")}</p>
          ) : null}
          {value.amountInEdited && suggestion ? (
            <button
              type="button"
              onClick={() => onChange({ amountInEdited: false })}
              className="self-start text-xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {t("exchangeRates.suggestion.useEstimate")}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
