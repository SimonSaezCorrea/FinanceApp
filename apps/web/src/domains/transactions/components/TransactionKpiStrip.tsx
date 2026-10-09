import { useTranslation } from "react-i18next";

import type { transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { useAuth } from "../../auth/hooks/useAuth";
import { isFullMonthRange, toCurrencyKpis } from "../lib/transactionMetrics";
import type { CurrencyKpi } from "../lib/transactionMetrics";

function monthLabel(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });
}

function MiniStat({
  label,
  dotClassName,
  amount,
  currency,
  locale,
}: Readonly<{
  label: string;
  dotClassName: string;
  amount: string;
  currency: string | null;
  locale: string;
}>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClassName)} aria-hidden />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {currency ? (
          formatMoney(amount, { currency, locale })
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
    </div>
  );
}

interface TransactionKpiStripProps {
  /** Per-currency totals for the WHOLE filtered set (from the summary
   * endpoint), not just the pages loaded so far. */
  currencyTotals: transactions.TransactionSummary["currencyTotals"];
  from?: string;
  to?: string;
}

/** Summary bar above the movements table: net balance + income/expense minis. */
export function TransactionKpiStrip({
  currencyTotals,
  from,
  to,
}: Readonly<TransactionKpiStripProps>) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const groups = toCurrencyKpis(currencyTotals);
  const fullMonth = isFullMonthRange(from, to);

  const balanceLabel =
    fullMonth && from
      ? t("transactions.kpi.balanceOf", { month: monthLabel(from, i18n.language) })
      : t("transactions.kpi.balance");

  // One row per currency the person uses (primary first), known before the totals arrive — so the
  // strip has its final height on the first paint instead of growing a row when a second currency
  // lands (a layout shift that pushed the filters and the table down). A currency with no movement
  // in the period keeps its row with a dash; one that has movements but isn't among the user's
  // currencies still gets its own row after them.
  const known = user ? [user.preferredCurrency, ...user.extraCurrencies] : [];
  const codes = [...known, ...groups.map((g) => g.currency).filter((c) => !known.includes(c))];
  const rows: { currency: string | null; kpi: CurrencyKpi | null }[] =
    codes.length > 0
      ? codes.map((c) => ({ currency: c, kpi: groups.find((g) => g.currency === c) ?? null }))
      : [{ currency: null, kpi: null }];

  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ currency, kpi: g }) => {
        const isNegative = g ? Number.parseFloat(g.netBalance) < 0 : false;

        return (
          <div
            key={currency ?? "empty"}
            // Stacked on a phone whatever the figures are: wrapping only once real amounts landed made
            // each row a line taller then, pushing the filters down (Lighthouse CLS 0.15).
            className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {balanceLabel}
                {rows.length > 1 && currency ? (
                  <span className="font-medium">· {currency}</span>
                ) : null}
              </span>
              {g ? (
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    isNegative ? "text-destructive" : "text-success",
                  )}
                >
                  {isNegative ? "−" : "+"}
                  {formatMoney(g.netBalance.replace(/^-/, ""), {
                    currency: g.currency,
                    locale: i18n.language,
                  })}
                </span>
              ) : (
                <span className="text-2xl font-bold tabular-nums text-muted-foreground">—</span>
              )}
            </div>

            <div className="flex items-center gap-8">
              <MiniStat
                label={t("transactions.kpi.income")}
                dotClassName="bg-success"
                amount={g?.totalIncome ?? "0"}
                currency={currency}
                locale={i18n.language}
              />
              <MiniStat
                label={t("transactions.kpi.expense")}
                dotClassName="bg-accent"
                amount={g?.totalExpense ?? "0"}
                currency={currency}
                locale={i18n.language}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
