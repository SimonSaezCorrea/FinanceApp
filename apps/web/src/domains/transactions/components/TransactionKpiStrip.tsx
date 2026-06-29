import { useTranslation } from "react-i18next";

import type { transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { summarizeByCurrency } from "../lib/transactionMetrics";

function KpiCard({
  label,
  value,
  currency,
  colorClass,
}: {
  label: string;
  value: string;
  currency: string;
  colorClass: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums tracking-tight ${colorClass}`}>
        {formatMoney(value, { currency })}
      </span>
    </div>
  );
}

interface TransactionKpiStripProps {
  transactions: transactions.Transaction[];
}

export function TransactionKpiStrip({ transactions: txs }: TransactionKpiStripProps) {
  const { t, i18n } = useTranslation();
  const groups = summarizeByCurrency(txs);

  if (groups.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[t("transactions.kpi.income"), t("transactions.kpi.expense"), t("transactions.kpi.balance")].map((label) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-lg font-semibold tabular-nums text-muted-foreground">—</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.currency} className="flex flex-col gap-1">
          {groups.length > 1 && (
            <span className="text-xs font-medium text-muted-foreground">{g.currency}</span>
          )}
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label={t("transactions.kpi.income")}
              value={g.totalIncome}
              currency={g.currency}
              colorClass="text-success"
            />
            <KpiCard
              label={t("transactions.kpi.expense")}
              value={g.totalExpense}
              currency={g.currency}
              colorClass="text-accent"
            />
            <KpiCard
              label={t("transactions.kpi.balance")}
              value={g.netBalance}
              currency={g.currency}
              colorClass={
                parseFloat(g.netBalance) < 0 ? "text-accent" : "text-success"
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
