import { useTranslation } from "react-i18next";

import type { debts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { summarizeDebtsByCurrency } from "../lib/debtMetrics";

interface DebtKpiStripProps {
  readonly debts: debts.Debt[];
}

export function DebtKpiStrip({ debts: list }: DebtKpiStripProps) {
  const { t, i18n } = useTranslation();
  const kpis = summarizeDebtsByCurrency(list);

  if (kpis.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.currency}
          className="flex flex-1 flex-col gap-3 rounded-lg border bg-card p-4 min-w-[260px]"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {kpi.currency}
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("debts.kpi.owedToYou")}</span>
              <span className="text-lg font-semibold tabular-nums text-success">
                {kpi.totalOwedToYou === "0.0000"
                  ? "—"
                  : formatMoney(kpi.totalOwedToYou, { locale: i18n.language, currency: kpi.currency })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("debts.kpi.youOwe")}</span>
              <span className="text-lg font-semibold tabular-nums text-accent">
                {kpi.totalYouOwe === "0.0000"
                  ? "—"
                  : formatMoney(kpi.totalYouOwe, { locale: i18n.language, currency: kpi.currency })}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("debts.kpi.balance")}</span>
              <span
                className={[
                  "text-lg font-semibold tabular-nums",
                  Number.parseFloat(kpi.netBalance) >= 0 ? "text-success" : "text-accent",
                ].join(" ")}
              >
                {formatMoney(kpi.netBalance, { locale: i18n.language, currency: kpi.currency })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
