import { useTranslation } from "react-i18next";

import { PRIMARY_CURRENCY } from "../lib/metrics";
import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/**
 * Loading shape of the Panel, in its order: what needs attention, net worth with its chart,
 * the month. Rule of the house: anything the CLIENT already knows renders for real (headings,
 * the "Entró/Salió" labels); only what the server decides is a placeholder. One column — it
 * stands in for every width, and the real layout takes over as soon as data lands.
 */
export function DashboardSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{t("dashboard.attention.title")}</span>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-2 p-5">
        <span className="text-sm font-medium text-muted-foreground">
          {t("dashboard.netWorth")} · {PRIMARY_CURRENCY}
        </span>
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-4 w-48" />
        {/* The chart's own band, so nothing below shifts when it arrives. */}
        <Skeleton className="mt-2 h-[170px] w-full" />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        {[t("dashboard.in"), t("dashboard.out")].map((row) => (
          <div
            key={row}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm"
          >
            <span className="text-muted-foreground">{row}</span>
            <Skeleton className="h-2.5 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </Card>
    </SkeletonScreen>
  );
}
