import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney, sumMoney } from "@finance/money";

import { convertApprox } from "../../../shared/lib/fx";
import { accountsSummary, type CurrencyTotal } from "../lib/grouping";

/**
 * Net worth across the whole account list, expressed in the user's primary
 * currency. Foreign balances are folded in through the STATIC approximate rates
 * in `shared/lib/fx` (there is no live FX provider) — hence "≈"; the untouched
 * per-currency amounts are still listed as chips underneath.
 */
function inPrimary(totals: CurrencyTotal[], primary: string): string {
  return sumMoney(
    totals.map((x) =>
      x.currency === primary ? x.total : (convertApprox(x.total, x.currency, primary) ?? "0"),
    ),
  );
}

export function AccountsSummary({
  list,
  primaryCurrency,
}: Readonly<{ list: accounts.BankAccount[]; primaryCurrency: string }>) {
  const { t, i18n } = useTranslation();
  if (list.length === 0) return null;

  const { net, assets, cardDebt } = accountsSummary(list);
  const heroCurrency = primaryCurrency;
  const money = (value: string, currency: string) =>
    formatMoney(value, { locale: i18n.language, currency });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-6 py-5">
      <div>
        <p className="text-xs text-muted-foreground">
          {t("accounts.overview.netWorth")}{" "}
          <span className="text-dim">
            {t("accounts.overview.netWorthHint", { currency: heroCurrency })}
          </span>
        </p>
        {/* Chips sit beside the hero number, not under it — stacking them made the
            card taller than the right-hand column and left it visually top-heavy. */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <p className="text-[30px] font-bold tabular-nums leading-none tracking-tight">
            {money(inPrimary(net, heroCurrency), heroCurrency)}
          </p>
          {net
            .filter((n) => n.currency !== heroCurrency)
            .map((n) => (
              <span
                key={n.currency}
                className="rounded-full bg-chip px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                {money(n.total, n.currency)}
              </span>
            ))}
        </div>
      </div>

      <div className="flex gap-8">
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.assets")}</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-success">
            {money(inPrimary(assets, heroCurrency), heroCurrency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.cardDebt")}</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-accent">
            −{money(inPrimary(cardDebt, heroCurrency), heroCurrency)}
          </p>
        </div>
      </div>
    </div>
  );
}
