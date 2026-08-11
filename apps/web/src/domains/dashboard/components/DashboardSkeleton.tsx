import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
// The one card-tile placeholder, shared with the wallet itself and with the
// account views, so every card-shaped skeleton in the app is the same shape.
import { CardTileSkeleton } from "../../accounts/components/CardTileSkeleton";

/**
 * Loading shape of the Panel.
 *
 * Rule of the house: anything the CLIENT already knows renders for real — card
 * titles, section headings, the income/expense labels and their icons. Only what
 * the server decides (amounts, percentages, the chart, the account tiles) shows
 * as a placeholder. A skeleton over a string we already have in the i18n catalog
 * hides information for no reason and makes the swap look like a redraw.
 */
export function DashboardSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
      <div className="flex flex-col gap-5">
        {/* Net worth */}
        <Card className="flex flex-col gap-3 p-5">
          <span className="text-sm font-medium text-muted-foreground">
            {t("dashboard.netWorth")}
          </span>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Skeleton className="h-[30px] w-56" />
            <Skeleton className="h-[14px] w-16" />
          </div>
          {/* Same 48px band the sparkline occupies, so the chips below it don't
              shift when the chart arrives. */}
          <Skeleton className="h-12 w-full" />
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Skeleton className="h-[26px] w-28 rounded-full" />
            <Skeleton className="h-[26px] w-28 rounded-full" />
          </div>
        </Card>

        {/* Wallet — same reserved header height as the real section. */}
        <div className="flex flex-col gap-3">
          <div className="flex h-8 items-center">
            <span className="text-sm font-medium text-muted-foreground">
              {t("dashboard.wallet")}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            <CardTileSkeleton />
            <CardTileSkeleton />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Month flow — labels and icons are ours, the amounts are not. */}
        <Card className="flex flex-col gap-3 p-4">
          <span className="text-sm font-semibold">{t("dashboard.monthFlow")}</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5 text-success" aria-hidden />
                {t("transactions.type.INCOME")}
              </span>
              <Skeleton className="h-[18px] w-24" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <ArrowDownLeft className="h-3.5 w-3.5 text-destructive" aria-hidden />
                {t("transactions.type.EXPENSE")}
              </span>
              <Skeleton className="h-[18px] w-24" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t("dashboard.savingsRate")}</span>
            <Skeleton className="h-[12px] w-12" />
          </div>
        </Card>

        {/* Categories: a ring, because that's the mark that lands here. */}
        <Card className="flex flex-col gap-3 p-4">
          <span className="text-sm font-semibold">{t("dashboard.spendByCategory")}</span>
          <div className="flex items-center gap-4">
            <Skeleton className="h-[120px] w-[120px] shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                  <Skeleton className="h-[11px] flex-1" />
                  <Skeleton className="h-[11px] w-14 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Upcoming payments */}
        <Card className="flex flex-col gap-2.5 p-4">
          <span className="text-sm font-semibold">{t("dashboard.upcoming")}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-[12px] w-2/3" />
                <Skeleton className="h-[10px] w-1/3" />
              </div>
              <Skeleton className="h-[13px] w-20 shrink-0" />
            </div>
          ))}
        </Card>
      </div>
    </SkeletonScreen>
  );
}
