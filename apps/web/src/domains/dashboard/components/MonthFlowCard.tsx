import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PRIMARY_CURRENCY, type MonthFlow } from "../lib/metrics";

export function MonthFlowCard({ flow }: { flow: MonthFlow }) {
  const { t, i18n } = useTranslation();
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: PRIMARY_CURRENCY });
  const ratePct = Math.round(flow.savingsRate * 100);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <span className="text-sm font-semibold">{t("dashboard.monthFlow")}</span>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-success" aria-hidden />
            {t("transactions.type.INCOME")}
          </span>
          <span className="tabular-nums text-lg font-semibold text-success">{fmt(flow.income)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ArrowDownLeft className="h-3.5 w-3.5 text-destructive" aria-hidden />
            {t("transactions.type.EXPENSE")}
          </span>
          <span className="tabular-nums text-lg font-semibold">{fmt(flow.expense)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>{t("dashboard.savingsRate")}</span>
          <span className="tabular-nums text-foreground">{ratePct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${ratePct}%` }} />
        </div>
      </div>
    </Card>
  );
}
