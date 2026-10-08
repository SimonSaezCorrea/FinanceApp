import { useTranslation } from "react-i18next";

import type { accounts, debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { netWorthByCurrency } from "../lib/netWorth";

/**
 * Net worth, the SAME figure the Panel shows (`netWorthByCurrency`): the hero is
 * the primary currency (accounts − card debt ± pending debts) and every other
 * currency is a chip of its own net, never converted — this app has no exchange
 * rate. Activos / Deuda tarjetas / Deudas break the hero down, so they add up to it.
 */
export function AccountsSummary({
  list,
  primaryCurrency,
  /** The load failed — the container stays (its own shape is what says "a
   * summary belongs here"), but every figure in it becomes a dash: whatever
   * `list` holds while erroring is stale cache, not a real answer to "how
   * much do you have", and showing a real-looking number for data that's
   * currently unreachable is worse than showing nothing at all. */
  unavailable = false,
  /** Debts between people: part of the net worth (pending amounts only). */
  debtList = [],
}: Readonly<{
  list: accounts.BankAccount[];
  primaryCurrency: string;
  unavailable?: boolean;
  debtList?: debts.Debt[];
}>) {
  const { t, i18n } = useTranslation();
  // Genuinely no accounts (not an error): nothing to summarize.
  if (list.length === 0 && !unavailable) return null;

  const heroCurrency = primaryCurrency;
  const money = (value: string, currency: string) =>
    formatMoney(value, { locale: i18n.language, currency });
  const dash = "—";
  const [hero, ...others] = netWorthByCurrency(
    unavailable ? [] : list,
    unavailable ? [] : debtList,
    heroCurrency,
  );
  const hasDebts = debtList.some((d) => d.settledAt === null && d.currency === heroCurrency);

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
            {unavailable ? dash : <MaskedAmount>{money(hero!.net, heroCurrency)}</MaskedAmount>}
          </p>
          {!unavailable &&
            others.map((n) => (
              <span
                key={n.currency}
                className="rounded-full bg-chip px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground"
              >
                <MaskedAmount>{money(n.net, n.currency)}</MaskedAmount>
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
            {unavailable ? dash : <MaskedAmount>{money(hero!.assets, heroCurrency)}</MaskedAmount>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.cardDebt")}</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-accent">
            {unavailable ? (
              dash
            ) : (
              <MaskedAmount>{`−${money(hero!.cardDebt, heroCurrency)}`}</MaskedAmount>
            )}
          </p>
        </div>
        {hasDebts ? (
          <div className="text-right">
            <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.debts")}</p>
            <p
              className={
                Number(hero!.debts) < 0
                  ? "mt-1 text-base font-semibold tabular-nums text-accent"
                  : "mt-1 text-base font-semibold tabular-nums text-success"
              }
            >
              {unavailable ? dash : <MaskedAmount>{money(hero!.debts, heroCurrency)}</MaskedAmount>}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
