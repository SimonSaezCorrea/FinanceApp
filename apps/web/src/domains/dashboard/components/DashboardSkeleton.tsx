import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { PRIMARY_CURRENCY } from "../lib/metrics";

export type DashboardLayout = "wide" | "medium" | "phone";

/**
 * Loading shape of the Panel. It takes the SAME arrangement the loaded Panel will use (`layout`
 * and `fit` come from `DashboardPage`, measured on the same element), so the swap to real data
 * doesn't move a box: urgent cards, net worth with its chart band, the month with its
 * categories, upcoming payments and the wallet, each where it will land. Rule of the house:
 * anything the CLIENT already knows renders for real (headings, "Entró/Salió"); only what the
 * server decides is a placeholder.
 */
export function DashboardSkeleton({
  label,
  layout,
  fit,
}: Readonly<{ label: string; layout: DashboardLayout; fit: boolean }>) {
  const { t } = useTranslation();

  const attention = (
    <div className="flex shrink-0 flex-col gap-2">
      <span className="text-sm font-semibold">{t("dashboard.attention.title")}</span>
      <div
        className={cn("gap-2.5", layout === "wide" ? "grid grid-cols-3" : "flex overflow-hidden")}
      >
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className={cn(
              "rounded-xl",
              fit ? "h-[62px]" : "h-[88px]",
              layout !== "wide" && "w-[17.5rem] shrink-0",
            )}
          />
        ))}
      </div>
    </div>
  );

  // Same heights `DashboardPage` hands `NetWorthCard` per arrangement.
  const chartHeight =
    layout === "phone" ? "h-[110px]" : layout === "wide" && !fit ? "h-[200px]" : "h-[170px]";
  const netWorth = (
    <Card className="flex flex-col gap-2 p-5">
      <span className="text-sm font-medium text-muted-foreground">
        {t("dashboard.netWorth")} · {PRIMARY_CURRENCY}
      </span>
      <Skeleton className="h-9 w-60" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-6 w-56 rounded-full" />
      {/* The chart's own band, so nothing below shifts when it arrives. */}
      <Skeleton className={cn("mt-2 w-full", chartHeight)} />
    </Card>
  );

  const month = (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-20" />
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
      <Skeleton className="h-4 w-52" />
    </div>
  );

  const categories = (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">{t("dashboard.spendByCategory")}</span>
      {["w-[90%]", "w-[55%]", "w-[35%]", "w-1/4"].map((w) => (
        <div key={w} className="grid grid-cols-[6rem_minmax(0,1fr)_6rem] items-center gap-3">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className={cn("h-2 rounded-full", w)} />
          <Skeleton className="h-3.5 w-full" />
        </div>
      ))}
    </div>
  );

  const payments = (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">{t("dashboard.upcoming")}</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b py-2 last:border-b-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );

  const wallet = (
    <div className={cn("flex flex-col gap-3", fit && "min-h-0 flex-1 overflow-hidden")}>
      <span className="text-sm font-medium text-muted-foreground">{t("dashboard.wallet")}</span>
      <div
        className={cn(
          "gap-3",
          fit || layout === "wide"
            ? "flex flex-col"
            : "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]",
        )}
      >
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-[210px] shrink-0 rounded-2xl" />
        ))}
      </div>
    </div>
  );

  return (
    <SkeletonScreen
      label={label}
      className={cn("flex flex-col", fit ? "min-h-0 flex-1 gap-4" : "gap-5")}
    >
      {attention}
      {fit ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)] grid-rows-[auto_minmax(0,1fr)] gap-4">
          <div className="col-span-2">{netWorth}</div>
          <div className="row-span-2 flex min-h-0 flex-col">{wallet}</div>
          <Card className="flex min-h-0 flex-col gap-5 overflow-hidden p-5">
            {month}
            {categories}
          </Card>
          <Card className="min-h-0 overflow-hidden p-5">{payments}</Card>
        </div>
      ) : layout === "wide" ? (
        <>
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
            {netWorth}
            <Card className="flex flex-col gap-5 p-5">
              {month}
              {categories}
            </Card>
          </div>
          <div className="grid grid-cols-2 items-start gap-5">
            <Card className="p-5">{payments}</Card>
            {wallet}
          </div>
        </>
      ) : layout === "medium" ? (
        <>
          {netWorth}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">{month}</Card>
            <Card className="p-5">{categories}</Card>
          </div>
          <Card className="p-5">{payments}</Card>
          {wallet}
        </>
      ) : (
        <>
          {netWorth}
          <Skeleton className="h-11 w-full rounded-xl" />
          <Card className="flex flex-col gap-5 p-4">
            {month}
            {categories}
          </Card>
        </>
      )}
    </SkeletonScreen>
  );
}
