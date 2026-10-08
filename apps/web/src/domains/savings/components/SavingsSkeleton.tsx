import { useTranslation } from "react-i18next";

import { cn } from "../../../shared/lib/cn";
import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

const ROWS = ["w-32", "w-40", "w-28"];

/** One placeholder row, matching `SavingsGoalRow`'s shape (the compact list). */
function SavingsGoalRowSkeleton({ titleWidth }: Readonly<{ titleWidth: string }>) {
  return (
    <div className="flex items-center gap-[14px] border-b border-border p-[14px_16px] last:border-b-0">
      <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className={cn("h-[15px]", titleWidth)} />
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

/** The wide form's table, with its real header (`SavingsGoalTable`). */
function SavingsGoalTableSkeleton() {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden rounded-[9.6px] p-0">
      <Table>
        <THead className="bg-muted/50">
          <TR>
            <TH>{t("savings.table.goal")}</TH>
            <TH>{t("savings.table.progress")}</TH>
            <TH numeric>{t("savings.table.amount")}</TH>
            <TH numeric>
              <span className="sr-only">{t("savings.table.actions")}</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {ROWS.map((w) => (
            <TR key={w}>
              <TD>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <Skeleton className={cn("h-3.5", w)} />
                </div>
              </TD>
              <TD>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-1.5 w-24 rounded-full" />
                  <Skeleton className="h-3 w-7" />
                </div>
              </TD>
              <TD numeric>
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </TD>
              <TD numeric>
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/**
 * Loading shape of the Ahorros view. It takes the SAME arrangement the loaded view will use
 * (`columns` = the insights rail beside the goals, `table` = the goals as a table, both decided by
 * `SavingsRoute` on the same measured element), so nothing moves when the data lands. Only the
 * FIGURES are unknown: the total card's labels, the group heading, the table header and the rail's
 * title are ours and render for real (same convention as `InstallmentsSkeleton`).
 */
export function SavingsSkeleton({
  label,
  columns = false,
  table = false,
}: Readonly<{ label: string; columns?: boolean; table?: boolean }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen
      label={label}
      className={cn("flex flex-col gap-6", columns && "flex-row items-start")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Card className="flex flex-col gap-4 rounded-[9.6px] p-[22px_24px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("savings.total.label")}</span>
              <Skeleton className="h-[42px] w-52" />
              <Skeleton className="h-[13px] w-72 max-w-full" />
            </div>
            <div className="flex flex-wrap gap-8">
              {(["thisMonth", "pace", "missing"] as const).map((k) => (
                <div key={k} className="flex flex-col gap-[3px]">
                  <span className="text-xs text-muted-foreground">{t(`savings.total.${k}`)}</span>
                  <Skeleton className="h-[22px] w-20" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="h-[10px] w-full rounded-full" />
          <div className="flex flex-wrap gap-4">
            {["w-28", "w-36", "w-28", "w-24"].map((w, i) => (
              <Skeleton key={i} className={cn("h-3", w)} />
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t("savings.groups.live")}
            </span>
            <Skeleton className="h-[13px] w-40" />
          </div>
          {table ? (
            <SavingsGoalTableSkeleton />
          ) : (
            <div className="overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
              {ROWS.map((w) => (
                <SavingsGoalRowSkeleton key={w} titleWidth={w} />
              ))}
            </div>
          )}
        </div>

        <Skeleton className="h-[58px] w-full rounded-[9.6px]" />
      </div>

      {columns ? (
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <Card className="flex flex-col gap-3 rounded-[9.6px] p-[18px_20px]">
            <span className="text-sm font-semibold text-foreground">
              {t("savings.insights.upcoming")}
            </span>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 border-t border-border py-2 first:border-t-0"
              >
                <Skeleton className="h-[30px] w-[30px] shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </SkeletonScreen>
  );
}
