import { useTranslation } from "react-i18next";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { Skeleton } from "../../../shared/ui/skeleton";

/** The rows of a column's values table while its summary loads. Shared by the page skeleton and
 * the detail itself, so both shimmer the same way. */
export function ValueRowsSkeleton({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3.5">
          <Skeleton className="h-[13px] w-24" />
          <Skeleton className="ml-auto h-[13px] w-10" />
          <Skeleton className="h-[13px] w-24" />
          <Skeleton className="h-[13px] w-8" />
        </div>
      ))}
    </>
  );
}

/**
 * "Columnas propias" while the list loads: the same list-beside-detail shape (or the list alone,
 * narrower) with the detail's real labels up front, as every list in the app does — a load in
 * progress keeps the page's chrome instead of a centered spinner.
 */
export function CustomFieldsSkeleton({ panes }: Readonly<{ panes: boolean }>) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex gap-6", !panes && "flex-col")} aria-busy="true">
      <span className="sr-only">{t("app.loading")}</span>
      <div className={cn("flex flex-col gap-1", panes && "w-72 shrink-0")}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "flex min-h-14 items-center justify-between gap-3 rounded-xl px-4 py-3",
              panes && i === 0 && "bg-surface2",
            )}
          >
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-[14px] w-28" />
              <Skeleton className="h-[11px] w-14" />
            </div>
            <Skeleton className="h-[11px] w-16" />
          </div>
        ))}
      </div>
      {panes ? (
        <section className="flex min-w-0 flex-1 flex-col gap-6 rounded-2xl border border-border bg-card p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-1 flex-col gap-2.5">
              <Skeleton className="h-[20px] w-40" />
              <Skeleton className="h-[13px] w-3/5" />
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="rounded-xl border border-border text-sm">
            <div className="flex gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>{t("customFields.detail.value")}</span>
              <span className="ml-auto">{t("customFields.detail.movements")}</span>
            </div>
            <ValueRowsSkeleton />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {(["type", "default", "column"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <dt className="text-muted-foreground">{t(`customFields.detail.${key}`)}</dt>
                <dd>
                  <Skeleton className="h-[13px] w-20" />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
