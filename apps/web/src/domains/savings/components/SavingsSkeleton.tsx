import { useTranslation } from "react-i18next";

import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/** One placeholder row, matching `SavingsGoalRow`'s shape. */
function SavingsGoalRowSkeleton() {
  return (
    <div className="flex items-center gap-[14px] border-b border-border p-[14px_16px] last:border-b-0">
      <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-[15px] w-32" />
          <Skeleton className="h-[11px] w-8" />
        </div>
        <Skeleton className="h-[6px] w-full rounded-full" />
        <Skeleton className="h-[11px] w-28" />
      </div>
      <div className="flex w-32 shrink-0 flex-col items-end gap-1">
        <Skeleton className="h-[15px] w-20" />
        <Skeleton className="h-[11px] w-16" />
      </div>
    </div>
  );
}

/**
 * Loading shape of the Ahorros view. Only the FIGURES are unknown yet — the
 * total card's own labels and the group headings are ours, fixed, and never
 * depend on the response, so they render for real (same convention as
 * `InstallmentsSkeleton`); only the amounts/rows shimmer.
 */
export function SavingsSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 rounded-[9.6px] p-[22px_24px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t("savings.total.label")}</span>
            <Skeleton className="h-[34px] w-36" />
            <Skeleton className="h-[13px] w-40" />
          </div>
          <div className="flex flex-wrap gap-8">
            <div className="flex flex-col gap-[3px]">
              <span className="text-xs text-muted-foreground">
                {t("savings.total.thisMonth")}
              </span>
              <Skeleton className="h-[17px] w-16" />
            </div>
            <div className="flex flex-col gap-[3px]">
              <span className="text-xs text-muted-foreground">{t("savings.total.pace")}</span>
              <Skeleton className="h-[17px] w-16" />
            </div>
            <div className="flex flex-col gap-[3px]">
              <span className="text-xs text-muted-foreground">{t("savings.total.missing")}</span>
              <Skeleton className="h-[17px] w-16" />
            </div>
          </div>
        </div>
        <Skeleton className="h-[10px] w-full rounded-full" />
      </Card>

      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <Skeleton className="h-[13px] w-24" />
            <Skeleton className="h-[13px] w-32" />
          </div>
          <div className="overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
            {Array.from({ length: 2 }, (_, i) => (
              <SavingsGoalRowSkeleton key={i} />
            ))}
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
