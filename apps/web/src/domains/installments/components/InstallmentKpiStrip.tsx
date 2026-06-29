import Decimal from "decimal.js";
import { useTranslation } from "react-i18next";

import type { installments } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { monthlyAmount } from "../lib/installmentMetrics";

interface InstallmentKpiStripProps {
  readonly plans: installments.InstallmentPlan[];
}

interface CurrencyKpi {
  currency: string;
  monthly: string;
  pending: string;
  nextDueDate: string | null;
}

function summarize(plans: installments.InstallmentPlan[]): CurrencyKpi[] {
  const map = new Map<string, { monthly: Decimal; pending: Decimal; nextDate: Date | null }>();

  for (const plan of plans) {
    const curr = plan.currency;
    const entry = map.get(curr) ?? { monthly: new Decimal(0), pending: new Decimal(0), nextDate: null };

    const hasUnpaid = plan.payments.some((p) => p.paidAt === null);
    if (hasUnpaid) {
      entry.monthly = entry.monthly.plus(new Decimal(monthlyAmount(plan)));
    }

    for (const p of plan.payments) {
      if (p.paidAt === null) {
        entry.pending = entry.pending.plus(new Decimal(p.amount));
        const d = new Date(p.dueDate);
        if (entry.nextDate === null || d < entry.nextDate) entry.nextDate = d;
      }
    }

    map.set(curr, entry);
  }

  return Array.from(map.entries()).map(([currency, { monthly, pending, nextDate }]) => ({
    currency,
    monthly: monthly.toFixed(4),
    pending: pending.toFixed(4),
    nextDueDate: nextDate ? nextDate.toISOString() : null,
  }));
}

export function InstallmentKpiStrip({ plans }: InstallmentKpiStripProps) {
  const { t, i18n } = useTranslation();
  const kpis = summarize(plans);

  if (kpis.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {kpis.map((kpi) => (
        <div key={kpi.currency} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{t("installments.kpi.monthly")}</span>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-destructive">
              {formatMoney(kpi.monthly, { locale: i18n.language, currency: kpi.currency })}
            </span>
          </div>

          <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
            <span className="text-xs text-muted-foreground">{t("installments.kpi.pending")}</span>
            <span className="text-xl font-semibold tabular-nums tracking-tight text-destructive">
              {formatMoney(kpi.pending, { locale: i18n.language, currency: kpi.currency })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
