import { useTranslation } from "react-i18next";

import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Card } from "../../../shared/ui/card";
import { Segmented } from "../../../shared/ui/segmented";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

/** One placeholder row for the narrow list layout, matching `DebtList`'s row shape. */
function DebtRowSkeleton() {
  return (
    <li className="flex w-full items-center gap-3 p-[12px_14px]">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[15px] w-28" />
        <Skeleton className="h-[11px] w-36" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Skeleton className="h-[15px] w-16" />
        <Skeleton className="h-[11px] w-14" />
      </div>
    </li>
  );
}

/** One placeholder row for the wide table layout, matching `DebtTable`'s column shape. */
function DebtTableRowSkeleton() {
  return (
    <TR>
      <TD>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[13px] w-28" />
            <Skeleton className="h-[11px] w-20" />
          </div>
        </div>
      </TD>
      <TD>
        <div className="flex items-center gap-3">
          <Skeleton className="h-1.5 w-24 rounded-full" />
          <Skeleton className="h-[11px] w-8" />
        </div>
      </TD>
      <TD>
        <Skeleton className="h-[20px] w-20 rounded-full" />
      </TD>
      <TD numeric>
        <Skeleton className="ml-auto h-[13px] w-20" />
      </TD>
      <TD>
        <Skeleton className="h-[13px] w-20" />
      </TD>
      <TD align="right">
        <Skeleton className="ml-auto h-8 w-16 rounded-md" />
      </TD>
    </TR>
  );
}

/**
 * Loading shape of the Deudas view. Only the FIGURES are unknown yet — the
 * summary card's own labels, the filter controls and the table's column
 * headers are ours, fixed, and never depend on the response, so they render
 * for real (same convention as `InstallmentsSkeleton`/`MovementsTableSkeleton`);
 * only the amounts/rows shimmer.
 */
export function DebtsSkeleton({ label }: Readonly<{ label: string }>) {
  const { t } = useTranslation();
  const [containerRef, width] = useElementWidth();
  const wide = width !== null && width >= TABLE_ROW_MIN_WIDTH;

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-[9.6px] border border-border bg-card p-[22px_24px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.youOwe")}</span>
            <Skeleton className="h-[22px] w-24" />
          </div>
          <div className="flex flex-col items-center gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.net")}</span>
            <Skeleton className="h-[15px] w-16" />
          </div>
          <div className="flex flex-col items-end gap-[3px]">
            <span className="text-xs text-muted-foreground">{t("debts.summary.owedYou")}</span>
            <Skeleton className="h-[22px] w-24" />
          </div>
        </div>
        <Skeleton className="h-[10px] w-full rounded-full" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value="ALL"
            onChange={() => {}}
            aria-label={t("debts.filters.all")}
            options={[
              { value: "ALL", label: t("debts.filters.all"), disabled: true },
              { value: "OWED_TO_YOU", label: t("debts.direction.OWED_TO_YOU"), disabled: true },
              { value: "YOU_OWE", label: t("debts.direction.YOU_OWE"), disabled: true },
              { value: "OVERDUE", label: t("debts.filters.overdue"), disabled: true },
            ]}
          />
          <select
            disabled
            className="rounded-[7.6px] border bg-card px-3 py-1.5 text-sm text-muted-foreground disabled:cursor-not-allowed"
          >
            <option>{t("debts.filters.active")}</option>
          </select>
        </div>
        <Skeleton className="h-[13px] w-24" />
      </div>

      <div ref={containerRef}>
        <div className={wide ? "block" : "hidden"}>
          <Card className="overflow-hidden p-0">
            <Table>
              <THead className="bg-muted/50">
                <TR>
                  <TH>{t("debts.table.person")}</TH>
                  <TH>{t("debts.table.progress")}</TH>
                  <TH>{t("debts.table.type")}</TH>
                  <TH align="right">{t("debts.table.pending")}</TH>
                  <TH>{t("debts.table.due")}</TH>
                  <TH align="right">
                    <span className="sr-only">{t("debts.table.actions")}</span>
                  </TH>
                </TR>
              </THead>
              <tbody>
                {Array.from({ length: 4 }, (_, i) => (
                  <DebtTableRowSkeleton key={i} />
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <ul
          className={
            wide ? "hidden" : "flex flex-col divide-y divide-border rounded-[9.6px] border bg-card"
          }
        >
          {Array.from({ length: 4 }, (_, i) => (
            <DebtRowSkeleton key={i} />
          ))}
        </ul>
      </div>
    </SkeletonScreen>
  );
}
