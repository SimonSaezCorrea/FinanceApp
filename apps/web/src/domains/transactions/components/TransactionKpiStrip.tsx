import { useTranslation } from "react-i18next";

import type { transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { isFullMonthRange, summarizeByCurrency } from "../lib/transactionMetrics";
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
        {currency ? formatMoney(amount, { currency, locale }) : <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

interface TransactionKpiStripProps {
  transactions: transactions.Transaction[];
  from?: string;
  to?: string;
}

/** Summary bar above the movements table: net balance + income/expense minis. */
export function TransactionKpiStrip({
  transactions: txs,
  from,
  to,
}: Readonly<TransactionKpiStripProps>) {
  const { t, i18n } = useTranslation();
  const groups = summarizeByCurrency(txs);
  const fullMonth = isFullMonthRange(from, to);

  const balanceLabel =
    fullMonth && from
      ? t("transactions.kpi.balanceOf", { month: monthLabel(from, i18n.language) })
      : t("transactions.kpi.balance");

  const rows: (CurrencyKpi | null)[] = groups.length > 0 ? groups : [null];

  return (
    <div className="flex flex-col gap-3">
      {rows.map((g) => {
        const isNegative = g ? Number.parseFloat(g.netBalance) < 0 : false;
        const currency = g?.currency ?? null;

        return (
          <div
            key={g?.currency ?? "empty"}
            className="flex flex-wrap items-center justify-between gap-6 rounded-lg border bg-card p-4"
          >
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {balanceLabel}
                {groups.length > 1 && g ? <span className="font-medium">· {g.currency}</span> : null}
              </span>
              {g ? (
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    isNegative ? "text-destructive" : "text-success",
                  )}
                >
                  {isNegative ? "−" : "+"}
                  {formatMoney(g.netBalance.replace(/^-/, ""), { currency: g.currency, locale: i18n.language })}
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
