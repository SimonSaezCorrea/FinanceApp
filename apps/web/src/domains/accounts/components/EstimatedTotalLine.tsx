import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { useLatestRates } from "../../exchange-rates/hooks/useExchangeRates";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { estimatedTotalClp, type CurrencyNetWorth } from "../lib/netWorth";

/**
 * "≈ $1.130.000 · todo en CLP (estimado, valor del 8 oct)": the net worth's one estimated
 * total in pesos (spec 030), shown BESIDE the per-currency figures, which stay unconverted.
 * It renders nothing when there is no foreign balance to add, or when any of them lacks a
 * recorded rate — a partial total that quietly leaves a balance out would be worse than none.
 */
export function EstimatedTotalLine({
  nets,
  className,
}: Readonly<{ nets: readonly Pick<CurrencyNetWorth, "currency" | "net">[]; className?: string }>) {
  const { t, i18n } = useTranslation();
  const { data: latest } = useLatestRates();
  const estimate = latest ? estimatedTotalClp(nets, latest) : null;
  if (!estimate) return null;

  const day = new Date(`${estimate.valueDate}T00:00:00`).toLocaleDateString(i18n.language, {
    day: "numeric",
    month: "short",
  });
  return (
    <p
      className={className}
      title={estimate.carried ? t("exchangeRates.carriedHint", { date: day }) : undefined}
    >
      <MaskedAmount>
        {t("exchangeRates.estimatedTotal", {
          amount: formatMoney(estimate.total, { locale: i18n.language, currency: "CLP" }),
          date: day,
        })}
      </MaskedAmount>
    </p>
  );
}
