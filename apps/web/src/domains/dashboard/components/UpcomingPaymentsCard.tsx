import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import type { UpcomingPayment } from "../lib/metrics";

/**
 * The next payments, soonest first. The date chip is neutral for every kind: red used to mark
 * debts, but red means "something went wrong", and a debt someone owes YOU was red too. Money
 * coming in shows with a "+" in green instead. No "ver todos": the list mixes instalments, debts
 * and recurring series, which have no single page to send it to.
 */
export function UpcomingPayments({ items }: Readonly<{ items: UpcomingPayment[] }>) {
  const { t, i18n } = useTranslation();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.upcomingEmpty")}</p>;
  }

  return (
    <ul className="flex flex-col divide-y">
      {items.map((p) => {
        const date = new Date(p.date);
        const kind = p.inflow
          ? t("dashboard.upcomingKind.debtOwedToYou")
          : t(`dashboard.upcomingKind.${p.kind}`);
        return (
          <li key={`${p.kind}-${p.id}`} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center leading-none">
                <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
                <span className="mt-0.5 text-xs sm:text-[10px] uppercase text-muted-foreground">
                  {date.toLocaleDateString(i18n.language, { month: "short" })}
                </span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{p.label}</span>
                <span className="truncate text-xs text-muted-foreground">{kind}</span>
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                p.inflow && "text-success",
              )}
            >
              <MaskedAmount>
                {p.inflow ? "+" : ""}
                {formatMoney(p.amount, { locale: i18n.language, currency: p.currency })}
              </MaskedAmount>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
