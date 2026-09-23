import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { useSampleFormat } from "../hooks/useSampleFormat";

/** The movements KPI strip (month balance, income, expenses) with the sample month's figures. */
export function MonthKpiStrip({
  className,
  showCurrency,
}: Readonly<{ className?: string; showCurrency?: boolean }>) {
  const { t } = useTranslation();
  const f = useSampleFormat();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-6 rounded-lg border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {t("landing.home.preview.monthBalance")}
          {showCurrency ? <span className="font-medium">· CLP</span> : null}
        </span>
        <span className="text-2xl font-bold tabular-nums text-destructive">
          {f.signed(-350110)}
        </span>
      </div>
      <div className="flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            {t("landing.home.preview.income")}
          </span>
          <span className="text-sm font-semibold tabular-nums">{f.money(1420000)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {t("landing.home.preview.expenses")}
          </span>
          <span className="text-sm font-semibold tabular-nums">{f.money(1770110)}</span>
        </div>
      </div>
    </div>
  );
}
