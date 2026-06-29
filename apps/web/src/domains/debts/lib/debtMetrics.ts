import Decimal from "decimal.js";

import type { debts } from "@finance/contracts";

export interface DebtKpi {
  currency: string;
  totalOwedToYou: string;
  totalYouOwe: string;
  netBalance: string;
}

export function summarizeDebtsByCurrency(list: debts.Debt[]): DebtKpi[] {
  const active = list.filter((d) => d.settledAt === null);
  const map = new Map<string, { owedToYou: Decimal; youOwe: Decimal }>();

  for (const d of active) {
    const entry = map.get(d.currency) ?? {
      owedToYou: new Decimal(0),
      youOwe: new Decimal(0),
    };
    if (d.direction === "OWED_TO_YOU") {
      entry.owedToYou = entry.owedToYou.plus(new Decimal(d.principal));
    } else {
      entry.youOwe = entry.youOwe.plus(new Decimal(d.principal));
    }
    map.set(d.currency, entry);
  }

  return Array.from(map.entries()).map(([currency, { owedToYou, youOwe }]) => ({
    currency,
    totalOwedToYou: owedToYou.toFixed(4),
    totalYouOwe: youOwe.toFixed(4),
    netBalance: owedToYou.minus(youOwe).toFixed(4),
  }));
}

export function calcRemaining(debt: debts.Debt): string {
  const pending = new Decimal(debt.totalInstallments - debt.paidInstallments);
  const perInstallment =
    debt.installmentAmount !== null
      ? new Decimal(debt.installmentAmount)
      : new Decimal(debt.principal).dividedBy(debt.totalInstallments);
  return pending.times(perInstallment).toFixed(4);
}
