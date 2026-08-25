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
  /** The load failed — the container stays (its own shape is what says "a
   * summary belongs here"), but every figure in it becomes a dash: whatever
   * `list` holds while erroring is stale cache, not a real answer to "how
   * much do you have", and showing a real-looking number for data that's
   * currently unreachable is worse than showing nothing at all. */
  unavailable = false,
}: Readonly<{ list: accounts.BankAccount[]; primaryCurrency: string; unavailable?: boolean }>) {
  const { t, i18n } = useTranslation();
  // Genuinely no accounts (not an error): nothing to summarize.
  if (list.length === 0 && !unavailable) return null;

  const heroCurrency = primaryCurrency;
  const money = (value: string, currency: string) =>
    formatMoney(value, { locale: i18n.language, currency });
  const { net, assets, cardDebt } = unavailable ? { net: [], assets: [], cardDebt: [] } : accountsSummary(list);
  const dash = "—";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-5 sm:px-6">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {t("accounts.overview.netWorth")}{" "}
          <span className="text-dim">
            {t("accounts.overview.netWorthHint", { currency: heroCurrency })}
          </span>
        </p>
        {/* Chips sit beside the hero number, not under it — stacking them made the
            card taller than the right-hand column and left it visually top-heavy. */}
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <p className="text-[26px] font-bold tabular-nums leading-none tracking-tight sm:text-[30px]">
            {unavailable ? dash : money(inPrimary(net, heroCurrency), heroCurrency)}
          </p>
          {!unavailable &&
            net
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

      {/* At 320px these two amounts no longer fit on one line beside each other:
          they wrap to their own rows instead of overflowing the card. */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:gap-8">
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.assets")}</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-success">
            {unavailable ? dash : money(inPrimary(assets, heroCurrency), heroCurrency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.cardDebt")}</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-accent">
            {unavailable ? dash : `−${money(inPrimary(cardDebt, heroCurrency), heroCurrency)}`}
          </p>
        </div>
      </div>
    </div>
  );
}
