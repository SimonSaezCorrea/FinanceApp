import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import type { UpcomingKind, UpcomingPayment } from "../lib/metrics";

// Date-chip tone per payment kind (red debt / blue recurring / amber installment).
const KIND_CHIP: Record<UpcomingKind, string> = {
  debt: "bg-destructive/15 text-destructive",
  recurring: "bg-info/15 text-info",
  installment: "bg-warning/15 text-warning",
};

export function UpcomingPaymentsCard({ items }: { items: UpcomingPayment[] }) {
  const { t, i18n } = useTranslation();

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("dashboard.upcoming")}</span>
        <Link to="/transactions" className="text-xs font-medium text-primary hover:underline">
          {t("dashboard.seeAll")}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.upcomingEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((p) => {
            const date = new Date(p.date);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-10 shrink-0 flex-col items-center justify-center rounded-md text-center leading-none",
                      KIND_CHIP[p.kind],
                    )}
                  >
                    <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
                    <span className="text-[10px] uppercase">
                      {date.toLocaleDateString(i18n.language, { month: "short" })}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{p.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t(`dashboard.upcomingKind.${p.kind}`)}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-sm font-medium">
                  {formatMoney(p.amount, { locale: i18n.language, currency: p.currency })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
