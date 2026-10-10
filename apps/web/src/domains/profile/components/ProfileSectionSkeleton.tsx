import { useTranslation } from "react-i18next";

import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/** A profile section's outline (title, description, a block of rows) while its chunk arrives. */
export function ProfileSectionSkeleton() {
  const { t } = useTranslation();
  return (
    <SkeletonScreen label={t("app.loading")} className="flex max-w-[760px] flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </SkeletonScreen>
  );
}

/** Rows of a profile list (sessions, consents) while it loads: an icon and two lines each. */
export function ProfileListRowsSkeleton({
  label,
  rows = 2,
}: Readonly<{ label: string; rows?: number }>) {
  return (
    <SkeletonScreen label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}
