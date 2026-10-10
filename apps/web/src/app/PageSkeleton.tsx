import { useTranslation } from "react-i18next";

import { Skeleton, SkeletonScreen } from "../shared/ui/skeleton";

/**
 * What a section shows inside the shell while its chunk is still on its way. Normally the chunk is
 * already there (`preloadAllPages`), but a click that beats the download used to leave the content
 * area blank: this keeps a page's outline (title, subtitle, a summary strip, a list) in its place.
 */
export function PageSkeleton() {
  const { t } = useTranslation();
  return (
    <SkeletonScreen label={t("app.loading")} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </SkeletonScreen>
  );
}
