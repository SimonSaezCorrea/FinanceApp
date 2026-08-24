import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/** One placeholder plan row, matching `InstallmentPlanList`'s row shape. */
function PlanRowSkeleton() {
  return (
    <li className="flex w-full items-center gap-3 p-4">
      <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-[15px] w-32" />
          <Skeleton className="h-[18px] w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-1.5 w-24 rounded-full" />
          <Skeleton className="h-[11px] w-8" />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-[15px] w-20" />
          <Skeleton className="h-[11px] w-28" />
        </div>
      </div>
    </li>
  );
}

/**
 * Loading shape of the Cuotas view — KPI tiles + a few plan-row placeholders,
 * mirroring `InstallmentKpiStrip`/`InstallmentPlanList` instead of a bare
 * spinner, so the page doesn't jump when the real content lands.
 */
export function InstallmentsSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <SkeletonScreen label={label} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <Skeleton className="h-[11px] w-20" />
            <Skeleton className="h-[22px] w-24" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-[13px] w-20" />
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border bg-card">
        {Array.from({ length: 4 }, (_, i) => (
          <PlanRowSkeleton key={i} />
        ))}
      </ul>
    </SkeletonScreen>
  );
}
