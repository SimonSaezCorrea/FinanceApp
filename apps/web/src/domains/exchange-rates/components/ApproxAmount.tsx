import { useTranslation } from "react-i18next";

import { exchangeRates } from "@finance/contracts";
import { convertAmount, formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { useLatestRates } from "../hooks/useExchangeRates";

/**
 * "≈ $950.000 · estimado, valor del 8 oct": what a USD amount is worth in pesos at the latest
 * recorded rate (spec 030). Always labelled an estimate and dated with the day the value was
 * PUBLISHED (a carried value says so by showing its older day). It is a hint, never a figure
 * the app stores or compares.
 *
 * Renders nothing — never an invented number — for any other currency (the UF only enters the
 * net worth's single estimated total) or while no rate is recorded. Hidden together with the
 * balance it sits beside when "ocultar saldos" is on.
 */
export function ApproxAmount({
  amount,
  currency,
  className,
}: Readonly<{ amount: string; currency: string; className?: string }>) {
  const { t, i18n } = useTranslation();
  const { data: latest } = useLatestRates();
  const rate = currency === "USD" ? latest?.USD : null;
  if (!rate) return null;

  const pesos = convertAmount(amount, rate.value, "CLP");
  const negative = pesos.startsWith("-");
  const shown = formatMoney(negative ? pesos.slice(1) : pesos, {
    locale: i18n.language,
    currency: "CLP",
  });
  const day = new Date(`${rate.valueDate}T00:00:00`).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
  });

  return (
    <span
      className={className}
      title={
        exchangeRates.isCarried(rate)
          ? t("exchangeRates.carriedHint", { date: day })
          : t("exchangeRates.estimatedTitle")
      }
    >
      <MaskedAmount>
        ≈ {negative ? "−" : ""}
        {shown}
        <span className="font-normal text-dim"> · {t("exchangeRates.estimatedOn", { date: day })}</span>
      </MaskedAmount>
    </span>
  );
}
