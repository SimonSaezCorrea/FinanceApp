import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/** One placeholder row, matching `RecurringRow`'s shape. */
function RecurringRowSkeleton() {
  return (
    <li className="flex items-center gap-[14px] border-b border-border p-[12px_16px] last:border-b-0">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[15px] w-32" />
        <Skeleton className="h-[11px] w-40" />
      </div>
      <Skeleton className="h-[15px] w-16 shrink-0" />
    </li>
  );
}

/**
 * Loading shape of the Recurrentes view. Only the FIGURES are unknown yet —
 * the total card's own label, the auto-generation strip and the group
 * headings are ours, fixed, and never depend on the response, so they render
 * for real (same convention as `InstallmentsSkeleton`); only the amounts/rows
 * shimmer. Two placeholder groups stand in for "however many periodicities
 * end up populated" — the real count isn't known until the response lands.
 */
export function RecurringSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[9.6px] border border-border bg-card p-[22px_24px]">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("recurring.total.label")}</span>
          <Skeleton className="h-[34px] w-32" />
        </div>
        <div className="flex min-w-[280px] flex-1 flex-col gap-2">
          <Skeleton className="h-[10px] w-full rounded-full" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-[9.6px] border border-border bg-card p-[12px_18px] text-[13px] text-muted-foreground max-sm:flex-col max-sm:items-start">
        <span className="flex items-center gap-2">
          <Zap className="h-[15px] w-[15px] text-success" aria-hidden />
          {t("recurring.autoGeneration.message")}
        </span>
      </div>

      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <Skeleton className="h-[13px] w-24" />
            <Skeleton className="h-[13px] w-16" />
          </div>
          <div className="overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,.28)]">
            <ul>
              {Array.from({ length: 3 }, (_, i) => (
                <RecurringRowSkeleton key={i} />
              ))}
            </ul>
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
