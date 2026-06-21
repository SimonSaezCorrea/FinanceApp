import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney, sumMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";

const DOT: Record<string, string> = {
  CLP: "bg-primary",
  USD: "bg-warning",
  EUR: "bg-info",
};

interface Total {
  currency: string;
  total: string;
  count: number;
}

function byCurrency(list: accounts.BankAccount[]): Total[] {
  const map = new Map<string, accounts.BankAccount[]>();
  for (const acc of list) {
    const bucket = map.get(acc.currency) ?? [];
    bucket.push(acc);
    map.set(acc.currency, bucket);
  }
  return [...map.entries()].map(([currency, accs]) => ({
    currency,
    total: sumMoney(accs.map((a) => a.currentBalance)),
    count: accs.length,
  }));
}

/** One summary card per currency present in the account list. */
export function CurrencyTotals({ list }: { list: accounts.BankAccount[] }) {
  const { t, i18n } = useTranslation();
  const totals = byCurrency(list);
  if (totals.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map(({ currency, total, count }) => (
        <Card key={currency} className="flex flex-col gap-1 p-4">
          <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", DOT[currency] ?? "bg-muted-foreground")} />
            {currency}
          </span>
          <span className="text-xl font-semibold tabular-nums tracking-tight">
            {formatMoney(total, { locale: i18n.language, currency })}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("accounts.countLabel", { count })}
          </span>
        </Card>
      ))}
    </div>
  );
}
