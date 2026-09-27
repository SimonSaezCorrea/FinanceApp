import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { CurrencyField } from "../../reference/components/CurrencyField";
import { useAllowedCurrencies } from "../../reference/hooks/useAllowedCurrencies";
import type { CurrencyLimitDraft } from "../lib/extraLimits";

/**
 * A credit card's own limits in currencies OTHER than its account's (the USD one
 * of a CLP card): the issuer keeps them apart and this app never converts, so
 * each is its own cap. Edited from the primary card and from the credit card
 * account itself — both write the same `CardLimit` rows of the primary card.
 *
 * When the user has no other currency enabled there is nothing to pick, and the
 * block says where to enable one instead of silently disappearing.
 */
export function ExtraCurrencyLimits({
  accountCurrency,
  limits,
  onChange,
}: Readonly<{
  accountCurrency: string;
  limits: CurrencyLimitDraft[];
  onChange: (limits: CurrencyLimitDraft[]) => void;
}>) {
  const { t, i18n } = useTranslation();
  const otherCodes = useAllowedCurrencies()
    .map((c) => c.code)
    .filter((code) => code !== accountCurrency);
  const update = (index: number, patch: Partial<CurrencyLimitDraft>) =>
    onChange(limits.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("cards.form.extraLimits")}
        </span>
        {otherCodes.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => onChange([...limits, { currency: otherCodes[0]!, limitAmount: "" }])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("cards.form.addLimit")}
          </Button>
        ) : null}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        {otherCodes.length > 0
          ? t("cards.form.extraLimitsHint")
          : t("cards.form.extraLimitsNoCurrencies")}
      </p>

      {limits.map((limit, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Field label={t("cards.form.currency")}>
            <CurrencyField
              value={limit.currency}
              onChange={(v) => update(i, { currency: v })}
              exclude={[accountCurrency]}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("cards.form.currency")}
            />
          </Field>
          <Field label={t("cards.form.limit")}>
            <Input
              className="border-transparent bg-transparent"
              inputMode="numeric"
              placeholder="0"
              value={formatAmountDisplay(
                limit.limitAmount,
                groupingLocaleFor(limit.currency, i18n.language),
              )}
              onChange={(e) => update(i, { limitAmount: e.target.value.replace(/\D/g, "") })}
              aria-label={t("cards.form.limit")}
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(limits.filter((_, j) => j !== i))}
            aria-label={t("common.delete")}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
