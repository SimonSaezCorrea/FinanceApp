import { TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import { Sparkline } from "../../../shared/ui/sparkline";
import { PRIMARY_CURRENCY, type netWorth, type secondaryTotals } from "../lib/metrics";

export function NetWorthCard({
  worth,
  secondary,
}: {
  worth: ReturnType<typeof netWorth>;
  secondary: ReturnType<typeof secondaryTotals>;
}) {
  const { t, i18n } = useTranslation();
  const pct = worth.changePct;
  const up = pct !== null && pct >= 0;
  const Trend = up ? TrendingUp : TrendingDown;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <span className="text-sm font-medium text-muted-foreground">{t("dashboard.netWorth")}</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">
          {formatMoney(worth.total, { locale: i18n.language, currency: PRIMARY_CURRENCY })}
        </span>
        {pct !== null ? (
          <span
            className={cn(
              "flex items-center gap-1 text-sm font-medium tabular-nums",
              up ? "text-success" : "text-destructive",
            )}
          >
            <Trend className="h-4 w-4" aria-hidden />
            {up ? "+" : ""}
            {pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%
          </span>
        ) : null}
      </div>

      {worth.series.length >= 2 ? (
        <Sparkline
          data={worth.series}
          tone={up ? "success" : "danger"}
          width={320}
          height={48}
          className="w-full"
        />
      ) : null}

      {secondary.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {secondary.map((s) => (
            <span
              key={s.currency}
              className="rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground"
            >
              {s.currency} {formatMoney(s.total, { locale: i18n.language, currency: s.currency })}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
